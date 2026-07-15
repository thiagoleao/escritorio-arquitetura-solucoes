import hmac
import os
from functools import wraps

import psycopg2
from flask import Flask, jsonify, request
from pgvector.psycopg2 import register_vector
from psycopg2.extras import Json, RealDictCursor

app = Flask(__name__)

INSTANCE_CONNECTION_NAME = os.environ["INSTANCE_CONNECTION_NAME"]
DB_NAME = os.environ.get("DB_NAME", "arquitetura_planner")
DB_USER = os.environ.get("DB_USER", "planner_app")
DB_PASSWORD = os.environ["DB_PASSWORD"]
SERVICE_API_KEY = os.environ["SERVICE_API_KEY"]

VALID_STATUSES = {"generated", "in_review", "reviewed", "approved", "archived"}
VALID_CLASSIFICATIONS = {"fez_sentido", "parcial", "nao_fez_sentido"}
VALID_EXECUTION_STATUSES = {"todo", "doing", "done"}

MILESTONE_COMPARE_FIELDS = ["title", "objective", "completion_criteria"]
ACTIVITY_COMPARE_FIELDS = [
    "title", "description", "expected_output", "dependencies", "status", "milestone_external_id",
]


def get_connection():
    connection = psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=f"/cloudsql/{INSTANCE_CONNECTION_NAME}",
        connect_timeout=10,
    )
    register_vector(connection)
    return connection


def require_api_key(function):
    @wraps(function)
    def decorated(*args, **kwargs):
        supplied_key = request.headers.get("X-Service-Api-Key", "")
        if not supplied_key or not hmac.compare_digest(supplied_key, SERVICE_API_KEY):
            return jsonify({"error": "Invalid service API key"}), 401
        return function(*args, **kwargs)
    return decorated


@app.get("/health")
def health():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return jsonify({"status": "ok", "database": "connected"})
    except Exception as error:
        app.logger.exception("Health check failed")
        return jsonify({"status": "error", "database": "unavailable", "message": str(error)}), 500


@app.get("/companies")
@require_api_key
def list_companies():
    query = request.args.get("q", "")
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT id, name FROM companies
                WHERE name ILIKE %s
                ORDER BY name
                LIMIT 10
                """,
                (f"%{query}%",),
            )
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/projects")
@require_api_key
def list_projects():
    company_id = request.args.get("company_id")
    query = request.args.get("q", "")
    if not company_id:
        return jsonify({"error": "Missing required query param: company_id"}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT id, name FROM projects
                WHERE company_id = %s AND name ILIKE %s
                ORDER BY name
                LIMIT 10
                """,
                (company_id, f"%{query}%"),
            )
            rows = cursor.fetchall()
    return jsonify(rows)


def find_or_create_company(cursor, name):
    cursor.execute("SELECT id FROM companies WHERE name = %s", (name,))
    row = cursor.fetchone()
    if row:
        return row["id"]
    cursor.execute(
        "INSERT INTO companies (name) VALUES (%s) RETURNING id",
        (name,),
    )
    return cursor.fetchone()["id"]


def find_or_create_project(cursor, company_id, name):
    if not name:
        return None
    cursor.execute(
        "SELECT id FROM projects WHERE company_id = %s AND name = %s",
        (company_id, name),
    )
    row = cursor.fetchone()
    if row:
        return row["id"]
    cursor.execute(
        "INSERT INTO projects (company_id, name) VALUES (%s, %s) RETURNING id",
        (company_id, name),
    )
    return cursor.fetchone()["id"]


def insert_milestones(cursor, version_id, milestones):
    for position, milestone in enumerate(milestones):
        cursor.execute(
            """
            INSERT INTO milestones (
                planning_version_id, external_id, title, objective, completion_criteria, position
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                version_id,
                milestone["external_id"],
                milestone["title"],
                milestone["objective"],
                Json(milestone["completion_criteria"]),
                position,
            ),
        )


def insert_activities(cursor, version_id, activities):
    for position, activity in enumerate(activities):
        cursor.execute(
            """
            INSERT INTO activities (
                planning_version_id, external_id, milestone_external_id, title,
                description, expected_output, dependencies, status, position
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                version_id,
                activity["external_id"],
                activity["milestone_external_id"],
                activity["title"],
                activity["description"],
                activity["expected_output"],
                Json(activity["dependencies"]),
                activity["status"],
                position,
            ),
        )


def insert_blockers(cursor, version_id, blockers):
    for blocker in blockers:
        cursor.execute(
            """
            INSERT INTO blockers (
                planning_version_id, description, related_activity_external_ids
            ) VALUES (%s, %s, %s)
            """,
            (version_id, blocker["description"], Json(blocker["related_activity_external_ids"])),
        )


def insert_embedding(cursor, version_id, embedding):
    if not embedding:
        return
    cursor.execute(
        "INSERT INTO embeddings (planning_version_id, embedding) VALUES (%s, %s)",
        (version_id, embedding),
    )


def assign_missing_external_ids(items, prefix, known_ids=()):
    next_number = 0
    candidates = [item.get("external_id") for item in items if item.get("external_id")]
    candidates.extend(known_ids)
    for external_id in candidates:
        if external_id and external_id.startswith(prefix) and external_id[len(prefix):].isdigit():
            next_number = max(next_number, int(external_id[len(prefix):]))
    for item in items:
        if not item.get("external_id"):
            next_number += 1
            item["external_id"] = f"{prefix}{next_number}"
    return items


def diff_entities(previous_by_id, new_items, compare_fields):
    events = []
    new_ids = set()
    for position, item in enumerate(new_items):
        external_id = item["external_id"]
        new_ids.add(external_id)
        previous = previous_by_id.get(external_id)
        if previous is None:
            events.append({"external_id": external_id, "action": "added", "details": {"position": position}})
            continue
        changed_fields = [field for field in compare_fields if previous[field] != item[field]]
        moved = previous["position"] != position
        if changed_fields:
            events.append({
                "external_id": external_id,
                "action": "edited",
                "details": {"changed_fields": changed_fields},
            })
        elif moved:
            events.append({
                "external_id": external_id,
                "action": "moved",
                "details": {"original_position": previous["position"], "new_position": position},
            })
        else:
            events.append({"external_id": external_id, "action": "accepted_unchanged", "details": {}})

    for external_id, previous in previous_by_id.items():
        if external_id not in new_ids:
            events.append({
                "external_id": external_id,
                "action": "removed",
                "details": {"original_position": previous["position"]},
            })
    return events


@app.post("/plannings")
@require_api_key
def create_planning():
    payload = request.get_json(silent=True) or {}
    required = ["company", "context", "objective", "deliverables", "plan"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400

    plan = payload["plan"]
    plan_required = ["summary", "assumptions", "missing_information", "milestones", "activities", "blockers"]
    missing_plan_fields = [field for field in plan_required if field not in plan]
    if missing_plan_fields:
        return jsonify({"error": "Missing required plan fields", "fields": missing_plan_fields}), 400

    normalized_milestones = [
        {
            "external_id": milestone["id"],
            "title": milestone["title"],
            "objective": milestone["objective"],
            "completion_criteria": milestone["completion_criteria"],
        }
        for milestone in plan["milestones"]
    ]
    normalized_activities = [
        {
            "external_id": activity["id"],
            "milestone_external_id": activity["milestone_id"],
            "title": activity["title"],
            "description": activity["description"],
            "expected_output": activity["expected_output"],
            "dependencies": activity["dependencies"],
            "status": activity["status"],
        }
        for activity in plan["activities"]
    ]
    normalized_blockers = [
        {
            "description": blocker["description"],
            "related_activity_external_ids": blocker["related_activity_ids"],
        }
        for blocker in plan["blockers"]
    ]

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            company_id = find_or_create_company(cursor, payload["company"])
            project_id = find_or_create_project(cursor, company_id, payload.get("project"))

            cursor.execute(
                """
                INSERT INTO plannings (
                    company_id, project_id, context, objective, deliverables, constraints
                ) VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    company_id,
                    project_id,
                    payload["context"],
                    payload["objective"],
                    payload["deliverables"],
                    payload.get("constraints"),
                ),
            )
            planning_id = cursor.fetchone()["id"]

            cursor.execute(
                """
                INSERT INTO planning_versions (
                    planning_id, version_number, summary, assumptions, missing_information, created_by
                ) VALUES (%s, 1, %s, %s, %s, 'model')
                RETURNING id
                """,
                (
                    planning_id,
                    plan["summary"],
                    Json(plan["assumptions"]),
                    Json(plan["missing_information"]),
                ),
            )
            version_id = cursor.fetchone()["id"]

            insert_milestones(cursor, version_id, normalized_milestones)
            insert_activities(cursor, version_id, normalized_activities)
            insert_blockers(cursor, version_id, normalized_blockers)
            insert_embedding(cursor, version_id, payload.get("embedding"))

    return jsonify({"planning_id": planning_id, "version_number": 1}), 201


@app.get("/plannings")
@require_api_key
def list_plannings():
    company = request.args.get("company")
    project = request.args.get("project")
    status = request.args.get("status")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    limit = min(request.args.get("limit", default=50, type=int), 200)
    offset = request.args.get("offset", default=0, type=int)

    clauses = []
    parameters = []
    if company:
        clauses.append("c.name ILIKE %s")
        parameters.append(f"%{company}%")
    if project:
        clauses.append("p.name ILIKE %s")
        parameters.append(f"%{project}%")
    if status:
        clauses.append("pl.status = %s")
        parameters.append(status)
    if date_from:
        clauses.append("pl.created_at >= %s")
        parameters.append(date_from)
    if date_to:
        clauses.append("pl.created_at <= %s")
        parameters.append(date_to)

    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    parameters.extend([limit, offset])

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                f"""
                SELECT
                    pl.id, pl.title, pl.status, pl.current_version,
                    pl.created_at, pl.updated_at,
                    c.name AS company_name, p.name AS project_name
                FROM plannings pl
                JOIN companies c ON c.id = pl.company_id
                LEFT JOIN projects p ON p.id = pl.project_id
                {where}
                ORDER BY pl.created_at DESC
                LIMIT %s OFFSET %s
                """,
                parameters,
            )
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/board")
@require_api_key
def get_board():
    company = request.args.get("company")
    status = request.args.get("status", "approved")

    clauses = ["pl.status = %s"]
    parameters = [status]
    if company:
        clauses.append("c.name ILIKE %s")
        parameters.append(f"%{company}%")
    where = "WHERE " + " AND ".join(clauses)

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                f"""
                SELECT pl.id AS planning_id, c.name AS company_name, p.name AS project_name,
                       pv.id AS version_id
                FROM plannings pl
                JOIN companies c ON c.id = pl.company_id
                LEFT JOIN projects p ON p.id = pl.project_id
                JOIN planning_versions pv ON pv.id = (
                    SELECT id FROM planning_versions
                    WHERE planning_id = pl.id AND version_number = pl.current_version
                )
                {where}
                ORDER BY c.name, p.name
                """,
                parameters,
            )
            plannings = cursor.fetchall()

            board = []
            for planning in plannings:
                cursor.execute(
                    """
                    SELECT a.external_id, a.title, a.milestone_external_id,
                           COALESCE(ae.status, 'todo') AS execution_status
                    FROM activities a
                    LEFT JOIN activity_execution ae
                        ON ae.planning_id = %s AND ae.activity_external_id = a.external_id
                    WHERE a.planning_version_id = %s
                    ORDER BY a.position
                    """,
                    (planning["planning_id"], planning["version_id"]),
                )
                activities = cursor.fetchall()
                total = len(activities)
                done = sum(1 for activity in activities if activity["execution_status"] == "done")
                completion_percentage = round((done / total) * 100) if total else 0

                board.append({
                    "planning_id": planning["planning_id"],
                    "company_name": planning["company_name"],
                    "project_name": planning["project_name"],
                    "completion_percentage": completion_percentage,
                    "activities": activities,
                })

    return jsonify(board)


@app.patch("/plannings/<planning_id>/activities/<activity_external_id>/status")
@require_api_key
def update_activity_execution_status(planning_id, activity_external_id):
    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    if status not in VALID_EXECUTION_STATUSES:
        return jsonify({"error": "Invalid status", "allowed": sorted(VALID_EXECUTION_STATUSES)}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT status FROM activity_execution WHERE planning_id = %s AND activity_external_id = %s",
                (planning_id, activity_external_id),
            )
            row = cursor.fetchone()
            previous_status = row["status"] if row else None

            cursor.execute(
                """
                INSERT INTO activity_execution (planning_id, activity_external_id, status)
                VALUES (%s, %s, %s)
                ON CONFLICT (planning_id, activity_external_id)
                DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
                """,
                (planning_id, activity_external_id, status),
            )

            cursor.execute(
                """
                INSERT INTO activity_status_history (planning_id, activity_external_id, from_status, to_status)
                VALUES (%s, %s, %s, %s)
                """,
                (planning_id, activity_external_id, previous_status, status),
            )

    return jsonify({
        "planning_id": planning_id,
        "activity_external_id": activity_external_id,
        "status": status,
    })


@app.get("/plannings/<planning_id>/similar")
@require_api_key
def get_similar_plannings(planning_id):
    limit = min(request.args.get("limit", default=5, type=int), 50)

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT e.embedding
                FROM embeddings e
                JOIN planning_versions pv ON pv.id = e.planning_version_id
                JOIN plannings pl ON pl.id = pv.planning_id AND pl.current_version = pv.version_number
                WHERE pl.id = %s
                """,
                (planning_id,),
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({"error": "Planning not found or has no embedding"}), 404

            cursor.execute(
                """
                SELECT
                    pl.id, pl.title, pl.status, pl.current_version,
                    pl.created_at, pl.updated_at,
                    c.name AS company_name, p.name AS project_name,
                    1 - (e.embedding <=> %s::vector) AS similarity
                FROM plannings pl
                JOIN companies c ON c.id = pl.company_id
                LEFT JOIN projects p ON p.id = pl.project_id
                JOIN planning_versions pv ON pv.id = (
                    SELECT id FROM planning_versions
                    WHERE planning_id = pl.id AND version_number = pl.current_version
                )
                JOIN embeddings e ON e.planning_version_id = pv.id
                WHERE pl.id != %s
                ORDER BY e.embedding <=> %s::vector
                LIMIT %s
                """,
                (row["embedding"], planning_id, row["embedding"], limit),
            )
            rows = cursor.fetchall()
    return jsonify(rows)


@app.post("/plannings/semantic-search")
@require_api_key
def semantic_search_plannings():
    payload = request.get_json(silent=True) or {}
    embedding = payload.get("embedding")
    if not embedding:
        return jsonify({"error": "Missing required field: embedding"}), 400

    limit = min(int(payload.get("limit", 20)), 100)

    clauses = []
    parameters = []
    if payload.get("company"):
        clauses.append("c.name ILIKE %s")
        parameters.append(f"%{payload['company']}%")
    if payload.get("project"):
        clauses.append("p.name ILIKE %s")
        parameters.append(f"%{payload['project']}%")
    if payload.get("status"):
        clauses.append("pl.status = %s")
        parameters.append(payload["status"])

    where = "WHERE " + " AND ".join(clauses) if clauses else ""

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                f"""
                SELECT
                    pl.id, pl.title, pl.status, pl.current_version,
                    pl.created_at, pl.updated_at,
                    c.name AS company_name, p.name AS project_name,
                    1 - (e.embedding <=> %s::vector) AS similarity
                FROM plannings pl
                JOIN companies c ON c.id = pl.company_id
                LEFT JOIN projects p ON p.id = pl.project_id
                JOIN planning_versions pv ON pv.id = (
                    SELECT id FROM planning_versions
                    WHERE planning_id = pl.id AND version_number = pl.current_version
                )
                JOIN embeddings e ON e.planning_version_id = pv.id
                {where}
                ORDER BY e.embedding <=> %s::vector
                LIMIT %s
                """,
                [embedding, *parameters, embedding, limit],
            )
            rows = cursor.fetchall()
    return jsonify(rows)


@app.get("/plannings/<planning_id>")
@require_api_key
def get_planning(planning_id):
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT
                    pl.*, c.name AS company_name, p.name AS project_name
                FROM plannings pl
                JOIN companies c ON c.id = pl.company_id
                LEFT JOIN projects p ON p.id = pl.project_id
                WHERE pl.id = %s
                """,
                (planning_id,),
            )
            planning = cursor.fetchone()
            if not planning:
                return jsonify({"error": "Planning not found"}), 404

            cursor.execute(
                """
                SELECT * FROM planning_versions
                WHERE planning_id = %s AND version_number = %s
                """,
                (planning_id, planning["current_version"]),
            )
            version = cursor.fetchone()

            cursor.execute(
                "SELECT * FROM milestones WHERE planning_version_id = %s ORDER BY position",
                (version["id"],),
            )
            milestones = cursor.fetchall()

            cursor.execute(
                "SELECT * FROM activities WHERE planning_version_id = %s ORDER BY position",
                (version["id"],),
            )
            activities = cursor.fetchall()

            cursor.execute(
                "SELECT * FROM blockers WHERE planning_version_id = %s",
                (version["id"],),
            )
            blockers = cursor.fetchall()

            cursor.execute(
                "SELECT activity_external_id, classification FROM activity_feedback WHERE planning_version_id = %s",
                (version["id"],),
            )
            activity_feedback = cursor.fetchall()

            cursor.execute(
                "SELECT * FROM planning_feedback WHERE planning_version_id = %s",
                (version["id"],),
            )
            planning_feedback = cursor.fetchone()

    return jsonify({
        "planning": planning,
        "version": version,
        "milestones": milestones,
        "activities": activities,
        "blockers": blockers,
        "activity_feedback": activity_feedback,
        "planning_feedback": planning_feedback,
    })


@app.patch("/plannings/<planning_id>")
@require_api_key
def update_planning_status(planning_id):
    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    if status not in VALID_STATUSES:
        return jsonify({"error": "Invalid status", "allowed": sorted(VALID_STATUSES)}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "UPDATE plannings SET status = %s, updated_at = NOW() WHERE id = %s RETURNING id",
                (status, planning_id),
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({"error": "Planning not found"}), 404

    return jsonify({"planning_id": planning_id, "status": status})


@app.get("/plannings/<planning_id>/versions")
@require_api_key
def list_planning_versions(planning_id):
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT version_number, created_by, notes, created_at
                FROM planning_versions
                WHERE planning_id = %s
                ORDER BY version_number DESC
                """,
                (planning_id,),
            )
            rows = cursor.fetchall()
    return jsonify(rows)


@app.post("/plannings/<planning_id>/versions")
@require_api_key
def create_planning_version(planning_id):
    payload = request.get_json(silent=True) or {}
    required = ["milestones", "activities", "blockers"]
    missing = [field for field in required if field not in payload]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400

    for feedback in payload.get("activity_feedback", []):
        if feedback.get("classification") not in VALID_CLASSIFICATIONS:
            return jsonify({"error": "Invalid activity_feedback classification", "fields": ["activity_feedback"]}), 400

    planning_feedback = payload.get("planning_feedback")
    if planning_feedback:
        score_fields = [
            "utility_score", "coverage_score", "sequence_quality_score",
            "detail_level_score", "objective_adherence_score",
        ]
        for field in score_fields:
            value = planning_feedback.get(field)
            if not isinstance(value, int) or not (1 <= value <= 5):
                return jsonify({"error": f"Invalid planning_feedback.{field}, must be an integer 1..5"}), 400

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM plannings WHERE id = %s", (planning_id,))
            planning = cursor.fetchone()
            if not planning:
                return jsonify({"error": "Planning not found"}), 404

            cursor.execute(
                "SELECT * FROM planning_versions WHERE planning_id = %s AND version_number = %s",
                (planning_id, planning["current_version"]),
            )
            previous_version = cursor.fetchone()

            cursor.execute(
                "SELECT * FROM milestones WHERE planning_version_id = %s",
                (previous_version["id"],),
            )
            previous_milestones = {row["external_id"]: row for row in cursor.fetchall()}

            cursor.execute(
                "SELECT * FROM activities WHERE planning_version_id = %s",
                (previous_version["id"],),
            )
            previous_activities = {row["external_id"]: row for row in cursor.fetchall()}

            new_milestones = assign_missing_external_ids(
                list(payload["milestones"]), "M", previous_milestones.keys()
            )
            new_activities = assign_missing_external_ids(
                list(payload["activities"]), "A", previous_activities.keys()
            )

            milestone_events = diff_entities(previous_milestones, new_milestones, MILESTONE_COMPARE_FIELDS)
            activity_events = diff_entities(previous_activities, new_activities, ACTIVITY_COMPARE_FIELDS)

            new_version_number = planning["current_version"] + 1

            cursor.execute(
                """
                INSERT INTO planning_versions (
                    planning_id, version_number, summary, assumptions, missing_information, created_by, notes
                ) VALUES (%s, %s, %s, %s, %s, 'user', %s)
                RETURNING id
                """,
                (
                    planning_id,
                    new_version_number,
                    previous_version["summary"],
                    Json(previous_version["assumptions"]),
                    Json(previous_version["missing_information"]),
                    payload.get("notes"),
                ),
            )
            new_version_id = cursor.fetchone()["id"]

            insert_milestones(cursor, new_version_id, new_milestones)
            insert_activities(cursor, new_version_id, new_activities)
            insert_blockers(cursor, new_version_id, payload["blockers"])
            insert_embedding(cursor, new_version_id, payload.get("embedding"))

            change_summary = {
                "accepted_unchanged": 0, "edited": 0, "removed": 0, "added": 0, "moved": 0,
            }
            for entity_type, events in (("milestone", milestone_events), ("activity", activity_events)):
                for event in events:
                    cursor.execute(
                        """
                        INSERT INTO change_events (
                            planning_id, from_version_number, to_version_number,
                            entity_type, external_id, action, details
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            planning_id,
                            planning["current_version"],
                            new_version_number,
                            entity_type,
                            event["external_id"],
                            event["action"],
                            Json(event["details"]),
                        ),
                    )
                    change_summary[event["action"]] += 1

            for feedback in payload.get("activity_feedback", []):
                cursor.execute(
                    """
                    INSERT INTO activity_feedback (planning_version_id, activity_external_id, classification)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (planning_version_id, activity_external_id)
                    DO UPDATE SET classification = EXCLUDED.classification
                    """,
                    (new_version_id, feedback["activity_external_id"], feedback["classification"]),
                )

            if planning_feedback:
                cursor.execute(
                    """
                    INSERT INTO planning_feedback (
                        planning_version_id, utility_score, coverage_score, sequence_quality_score,
                        detail_level_score, objective_adherence_score, notes
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        new_version_id,
                        planning_feedback["utility_score"],
                        planning_feedback["coverage_score"],
                        planning_feedback["sequence_quality_score"],
                        planning_feedback["detail_level_score"],
                        planning_feedback["objective_adherence_score"],
                        planning_feedback.get("notes"),
                    ),
                )

            cursor.execute(
                "UPDATE plannings SET current_version = %s, status = 'reviewed', updated_at = NOW() WHERE id = %s",
                (new_version_number, planning_id),
            )

    return jsonify({
        "planning_id": planning_id,
        "version_number": new_version_number,
        "change_summary": change_summary,
    }), 201


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    app.logger.exception("Unexpected error")
    return jsonify({"error": "Internal server error", "message": str(error)}), 500

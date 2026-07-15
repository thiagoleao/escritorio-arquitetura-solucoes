import hmac
import os
from functools import wraps

import psycopg2
from flask import Flask, jsonify, request
from psycopg2.extras import Json, RealDictCursor

app = Flask(__name__)

INSTANCE_CONNECTION_NAME = os.environ["INSTANCE_CONNECTION_NAME"]
DB_NAME = os.environ.get("DB_NAME", "arquitetura_planner")
DB_USER = os.environ.get("DB_USER", "planner_app")
DB_PASSWORD = os.environ["DB_PASSWORD"]
SERVICE_API_KEY = os.environ["SERVICE_API_KEY"]


def get_connection():
    return psycopg2.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=f"/cloudsql/{INSTANCE_CONNECTION_NAME}",
        connect_timeout=10,
    )


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

            for position, milestone in enumerate(plan["milestones"]):
                cursor.execute(
                    """
                    INSERT INTO milestones (
                        planning_version_id, external_id, title, objective, completion_criteria, position
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        version_id,
                        milestone["id"],
                        milestone["title"],
                        milestone["objective"],
                        Json(milestone["completion_criteria"]),
                        position,
                    ),
                )

            for position, activity in enumerate(plan["activities"]):
                cursor.execute(
                    """
                    INSERT INTO activities (
                        planning_version_id, external_id, milestone_external_id, title,
                        description, expected_output, dependencies, status, position
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        version_id,
                        activity["id"],
                        activity["milestone_id"],
                        activity["title"],
                        activity["description"],
                        activity["expected_output"],
                        Json(activity["dependencies"]),
                        activity["status"],
                        position,
                    ),
                )

            for blocker in plan["blockers"]:
                cursor.execute(
                    """
                    INSERT INTO blockers (
                        planning_version_id, description, related_activity_external_ids
                    ) VALUES (%s, %s, %s)
                    """,
                    (
                        version_id,
                        blocker["description"],
                        Json(blocker["related_activity_ids"]),
                    ),
                )

    return jsonify({"planning_id": planning_id, "version_number": 1}), 201


@app.get("/plannings")
@require_api_key
def list_plannings():
    company = request.args.get("company")
    project = request.args.get("project")
    status = request.args.get("status")
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

    return jsonify({
        "planning": planning,
        "version": version,
        "milestones": milestones,
        "activities": activities,
        "blockers": blockers,
    })


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    app.logger.exception("Unexpected error")
    return jsonify({"error": "Internal server error", "message": str(error)}), 500

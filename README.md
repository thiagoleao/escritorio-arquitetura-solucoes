# Planejador de Soluções de Arquitetura

Aplicação web que gera um roadmap estruturado (marcos, atividades, dependências, bloqueios e informações ausentes) a partir do contexto de uma demanda de arquitetura, com histórico, versionamento e aprendizado por recuperação — ver [`docs/adr`](./docs/adr) para as decisões de arquitetura ([ADR-001](./docs/adr/ADR-001.md), [ADR-002](./docs/adr/ADR-002.md), [ADR-003](./docs/adr/ADR-003.md)).

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha ANTHROPIC_API_KEY ou OPENAI_API_KEY
npm run dev
```

## Configuração do provedor de LLM

Definido por `LLM_PROVIDER` (`anthropic` ou `openai`) em `.env.local`. A troca de provedor não exige alteração de código — ver [`src/lib/llm`](./src/lib/llm).

## Deploy

`Dockerfile` gera uma imagem standalone pronta para Cloud Run (projeto GCP `thiago-ai-platform`).

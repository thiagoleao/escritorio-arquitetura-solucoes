# Planejador de Soluções de Arquitetura

Aplicação web stateless que gera um roadmap estruturado (marcos, atividades, dependências, bloqueios e informações ausentes) a partir do contexto de uma demanda de arquitetura, conforme [ADR-001](<./ADR - ESCRITÓRIO DE ARQUITETURA SOLUÇÕES/ADR 001.docx>).

Sem banco de dados, sem autenticação, execução síncrona. O usuário copia o resultado manualmente para o Trello.

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

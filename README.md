# MCP Plugin

Plugin do Claude Code que expõe uma API REST como ferramentas MCP, com autenticação JWT (login automático + renovação de token) via servidor stdio em Node.js.

## Requisitos

- Node.js 18+

## Instalação

```bash
cd mcp-server
npm install
```

## Configuração

Variáveis de ambiente:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `API_BASE_URL` | sim | URL base da API (com versão, se aplicável) |
| `API_TOKEN` | não* | Token JWT pronto |
| `AUTH_BASE_URL` | não* | URL base do endpoint de login |
| `AUTH_API_KEY` | não* | Bearer exigido pelo endpoint de login |
| `OXFORD_USER` / `OXFORD_PASSWORD` / `OXFORD_ACCOUNT` | não* | Credenciais para login automático |
| `NODE_EXTRA_CA_CERTS` | não | Caminho de CA extra, se a rede fizer inspeção SSL |

\* Defina `API_TOKEN` **ou** o conjunto `AUTH_BASE_URL` + `AUTH_API_KEY` + `OXFORD_USER` + `OXFORD_PASSWORD` + `OXFORD_ACCOUNT`. Com login automático, o servidor chama `POST {AUTH_BASE_URL}/User/login`, guarda o JWT em memória e renova quando expira ou em resposta 401.

Nunca versione credenciais — sempre via variável de ambiente (shell ou `.env` fora do controle de versão).

## Uso local (dev)

```bash
claude --plugin-dir <caminho-do-projeto>
```

## Instalação como plugin

```bash
claude plugin marketplace add <caminho-do-projeto>
claude plugin install <nome-do-plugin>@<nome-do-marketplace>
```

- `plugin.json` e `marketplace.json` ficam em `.claude-plugin/` (exigido por `claude plugin validate`).
- O plugin instalado usa uma **cópia em cache**, não o código-fonte direto. Depois de editar `index.js`, reinstale (`uninstall` + `install`) ou dê bump de versão em `plugin.json` + `claude plugin update` pra forçar o recarregamento.
- Teste sempre numa conversa nova — um servidor MCP já em execução não recarrega o código sozinho.

## Troubleshooting

- Variável de ambiente nova só vale pra processos abertos **depois** da mudança — feche e reabra o terminal/app.
- Apps empacotados (ex.: Microsoft Store/MSIX) podem não recarregar o ambiente nem reiniciando — nesse caso, faça logoff/login no SO.
- Erro `fetch failed (causa: SELF_SIGNED_CERT_IN_CHAIN)`: rede com inspeção SSL corporativa. Configure `NODE_EXTRA_CA_CERTS` apontando pro certificado da CA. Se a interpolação `${NODE_EXTRA_CA_CERTS}` não resolver no `env` do `plugin.json` (alguns hosts filtram variáveis com prefixo `NODE_`), use o valor literal do caminho em vez da referência.

## Tools de escrita/destrutivas

Tools marcadas `[ESCRITA]` ou `[DESTRUTIVO]` na descrição pedem confirmação antes de executar — isso ajuda o Claude a ser cauteloso, mas não é uma garantia técnica. Para bloquear completamente, remova a entrada correspondente do array `TOOLS` em `mcp-server/index.js`.

## Segurança

- Nunca coloque token/senha direto em `plugin.json` — sempre via variável de ambiente.
- Cada pessoa deve usar sua própria credencial, respeitando as permissões que a API já aplica.

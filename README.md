# Plugin: Oxford Online — Product API

Conecta o Claude Code ao `ProductController` da API Oxford Online (EF Core / C#) via servidor MCP.

## Endpoints mapeados

| Tool MCP | Método | Rota real | Observação |
|---|---|---|---|
| `listar_produtos` | GET | `/Product` | — |
| `buscar_produtos` | GET | `/Product/Search` | filtros: product, barcode, family, brand, line, decoration, nome |
| `buscar_produto_por_id` | GET | `/Product/{productId}` | — |
| `buscar_detalhes_produto` | GET | `/Product/productData/{productId}` | — |
| `buscar_detalhes_produtos_em_lote` | POST | `/Product/productsData` | body: lista de IDs |
| `buscar_detalhes_completos_por_local` | GET | `/Product/Details?status&location_id` | — |
| `buscar_produtos_oxford_filtrados` | POST | `/Product/ProductOxford` | body: `ProductOxfordFilters` |
| `atualizar_produto` | PUT | `/Product/{productId}` | **escrita** |
| `deletar_produto` | DELETE | `/Product/{productId}` | **destrutivo** |

Endpoints que **não** mapeei ainda (adicione seguindo o mesmo padrão em `mcp-server/index.js` se precisar):
- `POST /Product` (`CreateOrUpdateProducts`, em lote) — omiti de propósito porque aceita uma `List<Product>` e faz upsert em massa; é mais arriscado expor direto para o Claude sem uma tool de confirmação clara.
- `POST /Product/AppSearch`, `GET /Product/AppProduct/{product}` — específicos do app, adicione se o Claude for usado nesse contexto.
- `GET /Product/productDataRange/{offsetId}` — varre 1000 IDs sequenciais, pode ser lento/custoso para o Claude chamar sem necessidade.
- `POST /Product/sync` — dispara sincronização de imagens via FTP; endpoint operacional, não recomendo expor a um agente sem um passo de confirmação extra.
- `POST /Product/ProductOxfordDetails` — mesmo padrão de `buscar_detalhes_produtos_em_lote`, fácil de replicar se precisar.

### `ImageController`

| Tool MCP | Método | Rota real | Observação |
|---|---|---|---|
| `buscar_imagem_por_id` | GET | `/Image/{id}` | — |
| `buscar_imagens_por_produto` | GET | `/Image/Product/{productId}/{finalidade}` | — |
| `criar_imagens` | POST | `/Image` | **escrita** — cadastra registros (productId+imagePath), não faz upload de arquivo |
| `substituir_imagens_produto_base64` | POST | `/Image/ReplaceProductImages/Base64` | **escrita** (**destrutivo** se `base64Images` vier vazio — apaga todas as imagens do produto/finalidade) |
| `atualizar_imagens_genericas_base64` | POST | `/Image/UpdateImages/Base64` | **escrita** (**destrutivo** se `base64Images` vier vazio — apaga todas as imagens do `codeId`) |
| `importar_imagens_por_url` | POST | `/Image/ImportImagesByUrl` | **escrita** — baixa, redimensiona (600x600) e substitui as imagens do produto |

Não mapeei de propósito:
- `GET /Image/ProductImage/{productId}/{finalidade}/{main}` (`DownloadZipByProduct`) — retorna um arquivo `.zip` binário; o `callApi` deste servidor só trata JSON/texto, então o conteúdo viria corrompido. Se precisar, implemente uma tool separada que trate `res.arrayBuffer()` e devolva o zip como anexo, não como texto.
- `POST /Image/ReplaceProductImages/{productId}/{finalidade}` e `POST /Image/UpdateProductImages/{productId}/{finalidade}` (`ReplaceImages`/`UpdateImages`) — recebem `[FromForm] List<IFormFile>` (upload multipart de arquivo de verdade), incompatível com o formato JSON simples usado aqui. Uso as variantes `.../Base64` acima no lugar (mesmo resultado, só que o arquivo vai zipado+Base64 dentro do JSON). Note também que, ao contrário da maioria das outras tools de escrita, essas duas rotas **não têm `[Authorize]`** no controller original.

## Configuração

1. Instale as dependências:

   ```bash
   cd mcp-server
   npm install
   ```

2. Defina as variáveis de ambiente. `OXFORD_API_BASE_URL` deve **incluir a versão**, já que o controller usa `[Route("v{version:apiVersion}/[controller]")]`:

   ```bash
   export OXFORD_API_BASE_URL="https://sua-api.com/v1.0"
   ```

   Para autenticação, escolha uma das duas opções:

   **Opção A — login automático (recomendado)**: o servidor MCP chama `POST {OXFORD_AUTH_BASE_URL}/User/login` sozinho, guarda o JWT em memória e renova quando expira (checa o `exp` do token e também reage a respostas 401).

   ```bash
   export OXFORD_AUTH_BASE_URL="https://oxfordonline.com.br/API/v1"
   export OXFORD_AUTH_API_KEY="bearer-fixo-exigido-pelo-endpoint-de-login"
   export OXFORD_USER="seu-usuario"
   export OXFORD_PASSWORD="sua-senha"
   export OXFORD_ACCOUNT="seu-email-da-conta"
   ```

   **Opção B — token pronto**: se preferir gerenciar o token você mesmo (ex.: já rodou o `curl` de login e quer colar o resultado):

   ```bash
   export OXFORD_API_TOKEN="seu-jwt-token"
   ```

   > Nunca coloque usuário/senha/token direto em arquivo de configuração versionado — sempre via variável de ambiente do seu shell (ou um `.env` fora do controle de versão).

   > ⚠️ **Antivírus com inspeção SSL (ex.: Kaspersky)**: se sua máquina tem um antivírus corporativo que intercepta HTTPS (comum em ambiente corporativo), o Node só vai confiar nos certificados reassinados por ele se a variável `NODE_EXTRA_CA_CERTS` (apontando pro `.pem` da CA do antivírus) estiver disponível pro processo do servidor MCP. Sintoma: erro `fetch failed (causa: SELF_SIGNED_CERT_IN_CHAIN)` só no app desktop, funcionando normalmente pelo CLI.
   >
   > No app desktop (`claude-desktop`), confirmamos com um log de debug que a substituição `${NODE_EXTRA_CA_CERTS}` **não resolve** — chega literal no processo filho, mesmo com a variável presente no perfil do Windows (suspeita: o host filtra/não repassa variáveis com prefixo `NODE_` na hora de resolver `${...}`, provavelmente por segurança, similar ao que Electron faz com `NODE_OPTIONS`). As demais variáveis (`OXFORD_*`) resolvem normalmente — o problema é específico desse prefixo.
   >
   > **Solução**: colocar o valor **literal** em `plugin.json`, sem `${...}`, em vez de referenciar a variável de ambiente:
   > ```json
   > "NODE_EXTRA_CA_CERTS": "C:\\Diones\\docbox\\.kaspersky-ca.pem"
   > ```
   > Se trocar de máquina/antivírus, atualize esse caminho manualmente (confirme o valor certo com `[Environment]::GetEnvironmentVariable("NODE_EXTRA_CA_CERTS","User")` no PowerShell) e dê bump de versão + `claude plugin update` pra forçar o cache a recarregar (veja aviso abaixo sobre cache).

3. Teste localmente (modo dev, sem instalar):

   ```bash
   claude --plugin-dir C:\Oxford\server-mcp
   ```

   Ou instale de verdade via marketplace local, pra ficar disponível em toda sessão/app sem precisar do `--plugin-dir`:

   ```bash
   claude plugin marketplace add C:\Oxford\server-mcp
   claude plugin install oxford-online-product-plugin@oxford-local
   ```

   O manifesto do plugin (`plugin.json`) e o do marketplace (`marketplace.json`) ficam em `.claude-plugin/` — é uma exigência do `claude plugin validate`, não pode ficar na raiz do projeto.

   > ⚠️ **Plugin instalado usa uma cópia em cache**, não o código-fonte direto: `claude plugin install` copia o diretório inteiro pra `~/.claude/plugins/cache/oxford-local/oxford-online-product-plugin/<versão>/`. Editar `mcp-server/index.js` aqui **não afeta** o plugin já instalado. `claude plugin update` só recarrega o cache se a versão em `plugin.json` mudou — senão ele reporta "already at the latest version" mesmo com o conteúdo desatualizado. Pra forçar a atualização depois de mexer no código:
   >
   > ```bash
   > claude plugin uninstall oxford-online-product-plugin@oxford-local
   > claude plugin install oxford-online-product-plugin@oxford-local
   > ```
   >
   > (ou bump da versão em `plugin.json` + `claude plugin update`). Sempre teste numa **conversa nova** depois — o servidor MCP já em execução numa conversa aberta não recarrega o código sozinho.

4. Peça coisas como:
   > "Busca produtos da marca X na linha Y"
   > "Quais os detalhes do produto 000123?"
   > "Lista os produtos ativos no local SP01"

## Troubleshooting: variáveis de ambiente não aparecem no app desktop

Se as tools do plugin aparecem "conectadas" mas toda chamada falha (ou o Claude diz que não há credenciais/MCP conectado), o suspeito nº 1 é **propagação de variável de ambiente**, não o código do plugin:

- Variáveis definidas com `[Environment]::SetEnvironmentVariable(..., "User")` (ou pela UI de "Variáveis de Ambiente" do Windows) só ficam visíveis para processos **abertos depois** da mudança.
- Um terminal (PowerShell/bash) já aberto continua com o ambiente antigo até ser fechado e reaberto.
- **O app "Claude" da Microsoft Store (pacote MSIX)** é o caso mais teimoso: ele roda via um serviço de ativação do Windows que cacheia o ambiente e **não recarrega nem fechando/reabrindo o app pela bandeja do sistema**. Foi exatamente isso que aconteceu aqui — reiniciar o app não bastou, mesmo com processos novos (`Get-Process` mostrando `StartTime` recente). Só um **logoff/login do Windows** (ou reboot) força o app a reler as variáveis novas.
- Pra diagnosticar rápido sem esperar o logoff: abra um terminal novo (depois de ter setado as variáveis) e rode `claude --print "liste as tools mcp que contenham oxford"` — se aparecerem lá, o plugin e as credenciais estão corretos; o problema é só o app desktop não ter recarregado o ambiente ainda.

## Sobre as tools de escrita/destrutivas

`atualizar_produto` e `deletar_produto` estão marcadas com `[ESCRITA]` / `[DESTRUTIVO]` na descrição — isso ajuda o Claude a pedir confirmação antes de executar, mas não é uma garantia técnica. Se quiser bloquear essas ações completamente num primeiro momento, é só comentar/remover essas duas entradas do array `TOOLS` em `index.js` até você confiar no fluxo.

## Segurança

- Nunca coloque o token direto no `plugin.json` — sempre via variável de ambiente.
- Se for compartilhar com o time, cada pessoa deve usar seu próprio `OXFORD_API_TOKEN`, respeitando as permissões que o `[Authorize]` da API já aplica.

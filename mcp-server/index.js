import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// API_BASE_URL deve incluir a versão, ex: https://sua-api.com/v1.0
// (o controller usa [Route("v{version:apiVersion}/[controller]")])
const API_BASE_URL = process.env.API_BASE_URL;

// Login automático (opcional): se OXFORD_USER/OXFORD_PASSWORD/OXFORD_ACCOUNT
// estiverem definidos, o servidor obtém e renova o JWT sozinho via
// POST {AUTH_BASE_URL}/User/login. Caso contrário, cai no fallback de um
// token estático em API_TOKEN.
const AUTH_BASE_URL = process.env.AUTH_BASE_URL;
const AUTH_API_KEY = process.env.AUTH_API_KEY; // bearer estático exigido pelo endpoint de login
const OXFORD_USER = process.env.OXFORD_USER;
const OXFORD_PASSWORD = process.env.OXFORD_PASSWORD;
const OXFORD_ACCOUNT = process.env.OXFORD_ACCOUNT;
const OXFORD_DEVICE = process.env.OXFORD_DEVICE ?? "";

const STATIC_API_TOKEN = process.env.API_TOKEN; // fallback: token do [Authorize] já pronto

if (!API_BASE_URL) {
  console.error("API_BASE_URL não configurada (ex: https://sua-api.com/v1.0).");
  process.exit(1);
}

const canAutoLogin = Boolean(
  AUTH_BASE_URL && AUTH_API_KEY && OXFORD_USER && OXFORD_PASSWORD && OXFORD_ACCOUNT
);

if (!canAutoLogin && !STATIC_API_TOKEN) {
  console.error(
    "Nenhuma credencial configurada: defina API_TOKEN (token pronto) ou " +
      "AUTH_BASE_URL + AUTH_API_KEY + OXFORD_USER + OXFORD_PASSWORD + OXFORD_ACCOUNT (login automático)."
  );
  process.exit(1);
}

let cachedToken = STATIC_API_TOKEN ?? null;

function decodeJwtExp(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json).exp; // segundos desde epoch
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const exp = decodeJwtExp(token);
  if (!exp) return false; // sem "exp" decodificável, assume válido até a API dizer o contrário
  const bufferSeconds = 30;
  return Date.now() / 1000 >= exp - bufferSeconds;
}

async function login() {
  const res = await fetch(`${AUTH_BASE_URL}/User/login`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/json",
      Authorization: `Bearer ${AUTH_API_KEY}`,
    },
    body: JSON.stringify({
      id: 0,
      user: OXFORD_USER,
      password: OXFORD_PASSWORD,
      account: OXFORD_ACCOUNT,
      profileId: 0,
      device: OXFORD_DEVICE,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Login falhou (${res.status}): ${text || res.statusText}`);
  }

  const { token } = await res.json();
  if (!token) {
    throw new Error("Resposta de login não trouxe campo 'token'.");
  }
  cachedToken = token;
  return token;
}

async function getToken() {
  if (canAutoLogin && (!cachedToken || isTokenExpired(cachedToken))) {
    return login();
  }
  return cachedToken;
}

async function callApi(path, { method = "GET", body } = {}, isRetry = false) {
  const token = await getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && canAutoLogin && !isRetry) {
    cachedToken = null;
    return callApi(path, { method, body }, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API respondeu ${res.status}: ${text || res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

function describeFetchError(err) {
  const cause = err?.cause;
  const causeInfo = cause ? ` (causa: ${cause.code ?? cause.message ?? cause})` : "";
  return `${err.message}${causeInfo}`;
}

const server = new Server(
  { name: "oxford-online-product-api", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  // GET /product
  {
    name: "listar_produtos",
    description: "Lista todos os produtos cadastrados",
    inputSchema: { type: "object", properties: {} },
    handler: async () => callApi("/Product"),
  },

  // GET /product/Search
  {
    name: "buscar_produtos",
    description:
      "Busca produtos com filtros opcionais: nome, código de barras, família, marca, linha, decoração",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string", description: "Nome/descrição do produto" },
        barcode: { type: "string" },
        family: { type: "string" },
        brand: { type: "string" },
        line: { type: "string" },
        decoration: { type: "string" },
        nome: { type: "string" },
      },
    },
    handler: async (args) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(args)) {
        if (value) params.set(key, value);
      }
      const query = params.toString() ? `?${params}` : "";
      return callApi(`/Product/Search${query}`);
    },
  },

  // GET /product/{productId}
  {
    name: "buscar_produto_por_id",
    description: "Busca um produto específico pelo ProductId",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
    },
    handler: async ({ productId }) => callApi(`/Product/${productId}`),
  },

  // GET /product/productData/{productId}
  {
    name: "buscar_detalhes_produto",
    description: "Busca os detalhes completos (ProductData) de um produto pelo ID",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
    },
    handler: async ({ productId }) =>
      callApi(`/Product/productData/${productId}`),
  },

  // POST /product/productsData
  {
    name: "buscar_detalhes_produtos_em_lote",
    description: "Busca os detalhes (ProductData) de vários produtos por uma lista de IDs",
    inputSchema: {
      type: "object",
      properties: {
        productIds: { type: "array", items: { type: "string" } },
      },
      required: ["productIds"],
    },
    handler: async ({ productIds }) =>
      callApi("/Product/productsData", { method: "POST", body: productIds }),
  },

  // GET /Product/Details?status=&location_id=
  {
    name: "buscar_detalhes_completos_por_local",
    description:
      "Busca ProductDetails filtrando por status (ativo/inativo) e local (location_id)",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "boolean" },
        location_id: { type: "string" },
      },
      required: ["status", "location_id"],
    },
    handler: async ({ status, location_id }) => {
      const params = new URLSearchParams({
        status: String(status),
        location_id,
      });
      return callApi(`/Product/Details?${params}`);
    },
  },

  // POST /Product/ProductOxford
  {
    name: "buscar_produtos_oxford_filtrados",
    description: "Busca produtos Oxford aplicando um objeto de filtros (ProductOxfordFilters)",
    inputSchema: {
      type: "object",
      description: "Estrutura deve espelhar o DTO ProductOxfordFilters da API",
      properties: {},
      additionalProperties: true,
    },
    handler: async (filters) =>
      callApi("/Product/ProductOxford", { method: "POST", body: filters }),
  },

  // PUT /product/{productId}  -- ESCRITA
  {
    name: "atualizar_produto",
    description:
      "[ESCRITA] Atualiza um produto existente. Requer o objeto Product completo, incluindo productId igual ao da URL.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string" },
        product: {
          type: "object",
          description: "Objeto Product completo (deve conter ProductId igual a productId)",
          additionalProperties: true,
        },
      },
      required: ["productId", "product"],
    },
    handler: async ({ productId, product }) =>
      callApi(`/Product/${productId}`, { method: "PUT", body: product }),
  },

  // DELETE /product/{productId} -- DESTRUTIVO
  {
    name: "deletar_produto",
    description:
      "[DESTRUTIVO] Remove um produto pelo ProductId. Use com cautela e apenas com confirmação explícita do usuário.",
    inputSchema: {
      type: "object",
      properties: { productId: { type: "string" } },
      required: ["productId"],
    },
    handler: async ({ productId }) =>
      callApi(`/Product/${productId}`, { method: "DELETE" }),
  },

  // GET /Image/{id}
  {
    name: "buscar_imagem_por_id",
    description: "Busca uma imagem específica pelo Id numérico",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
    handler: async ({ id }) => callApi(`/Image/${id}`),
  },

  // GET /Image/Product/{productId}/{finalidade}
  {
    name: "buscar_imagens_por_produto",
    description:
      "Lista as imagens de um produto para uma finalidade específica (o valor de finalidade deve corresponder ao enum Finalidade da API)",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string" },
        finalidade: { type: "string", description: "Nome/valor do enum Finalidade" },
      },
      required: ["productId", "finalidade"],
    },
    handler: async ({ productId, finalidade }) =>
      callApi(`/Image/Product/${productId}/${finalidade}`),
  },

  // POST /Image  -- ESCRITA
  {
    name: "criar_imagens",
    description:
      "[ESCRITA] Cria (ou substitui, por productId+ImagePath) registros de imagem em lote. Requer productId e imagePath em cada item — não faz upload de arquivo, apenas cadastra o registro/caminho.",
    inputSchema: {
      type: "object",
      properties: {
        images: {
          type: "array",
          description: "Lista de objetos Image (cada um deve ter ao menos productId e imagePath)",
          items: { type: "object", additionalProperties: true },
        },
      },
      required: ["images"],
    },
    handler: async ({ images }) => callApi("/Image", { method: "POST", body: images }),
  },

  // POST /Image/ReplaceProductImages/Base64  -- ESCRITA
  {
    name: "substituir_imagens_produto_base64",
    description:
      "[ESCRITA] Substitui as imagens de um produto/finalidade. Cada item de base64Images deve ser um ZIP (contendo 1 imagem) codificado em Base64. Enviar base64Images vazio/omitido APAGA todas as imagens do produto para essa finalidade — [DESTRUTIVO] nesse caso.",
    inputSchema: {
      type: "object",
      properties: {
        productId: { type: "string" },
        finalidade: { type: "string", description: "Nome/valor do enum Finalidade" },
        base64Images: {
          type: "array",
          description: "Lista de ZIPs (cada um com 1 imagem) em Base64. Vazio = apaga todas as imagens do produto.",
          items: { type: "string" },
        },
      },
      required: ["productId", "finalidade"],
    },
    handler: async ({ productId, finalidade, base64Images }) =>
      callApi("/Image/ReplaceProductImages/Base64", {
        method: "POST",
        body: { ProductId: productId, Finalidade: finalidade, Base64Images: base64Images ?? [] },
      }),
  },

  // POST /Image/UpdateImages/Base64  -- ESCRITA (genérico, não vinculado a Product)
  {
    name: "atualizar_imagens_genericas_base64",
    description:
      "[ESCRITA] Versão genérica (não específica de Product) para atualizar imagens vinculadas a um codeId qualquer. Cada item de base64Images é um ZIP em Base64 (pode conter mais de uma imagem dentro do ZIP). Enviar base64Images vazio/omitido APAGA todas as imagens desse codeId — [DESTRUTIVO] nesse caso.",
    inputSchema: {
      type: "object",
      properties: {
        codeId: { type: "string", description: "Identificador genérico ao qual as imagens ficam vinculadas" },
        createdUser: { type: "string" },
        base64Images: {
          type: "array",
          description: "Lista de ZIPs em Base64. Vazio = apaga todas as imagens do codeId.",
          items: { type: "string" },
        },
      },
      required: ["codeId"],
    },
    handler: async ({ codeId, createdUser, base64Images }) =>
      callApi("/Image/UpdateImages/Base64", {
        method: "POST",
        body: { CodeId: codeId, CreatedUser: createdUser, Base64Images: base64Images ?? [] },
      }),
  },

  // POST /Image/ImportImagesByUrl  -- ESCRITA
  {
    name: "importar_imagens_por_url",
    description:
      "[ESCRITA] Baixa imagens a partir de URLs, redimensiona pra 600x600 com fundo branco e salva vinculadas ao produto/finalidade informados (substitui as imagens existentes do produto, igual substituir_imagens_produto_base64).",
    inputSchema: {
      type: "object",
      properties: {
        finalidade: { type: "string", description: "Nome/valor do enum Finalidade aplicado a todas as imagens do lote" },
        images: {
          type: "array",
          description: "Lista de { product, urlImage } — product é o ProductId, urlImage é a URL pública da imagem",
          items: {
            type: "object",
            properties: {
              product: { type: "string" },
              urlImage: { type: "string" },
            },
            required: ["product", "urlImage"],
          },
        },
      },
      required: ["finalidade", "images"],
    },
    handler: async ({ finalidade, images }) =>
      callApi("/Image/ImportImagesByUrl", {
        method: "POST",
        body: { Finalidade: finalidade, Images: images },
      }),
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = TOOLS.find((t) => t.name === request.params.name);
  if (!tool) {
    throw new Error(`Tool desconhecida: ${request.params.name}`);
  }

  try {
    const result = await tool.handler(request.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Erro ao chamar a API: ${describeFetchError(err)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

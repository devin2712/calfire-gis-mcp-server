import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { toFetchResponse, toReqRes } from "fetch-to-node";
import { Hono } from 'hono';
import { tools } from './mcp/tools.js';
import { logger } from './utils/logger.js';
import { AddressSchema } from './types/schemas.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };

// Create server and transport
export const app = new Hono();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // set to undefined for stateless servers
});

const server = new Server({
  name: pkg.name,
  version: pkg.version,
  description: 'MCP Server for CAL FIRE DINS fire damage assessment data',
}, {
  capabilities: {
    tools: {},
    progress: true,
  }
});

// Server initialization state
let serverInitialized = false;

// Initialize the server
async function initializeServer() {
  if (!serverInitialized) {
    await server.connect(transport);
    serverInitialized = true;
    logger.info('MCP Server connected to transport');
  }
}

// Error response helper
function createErrorResponse(code: number, message: string) {
  return {
    jsonrpc: "2.0",
    error: {
      code,
      message
    },
    id: null,
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.parameters)
    }))
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    // Parse the arguments using the tool's parameter schema
    const args = tool.parameters.parse(request.params.arguments);
    const result = await tool.handler(args as { address: z.infer<typeof AddressSchema> });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    logger.error({ error }, 'Error handling tool request');
    throw error;
  }
});

app.use('*', async (c, next) => {
  logger.info({ method: c.req.method, path: c.req.path }, 'Incoming request');
  await next();
});

app.post('/mcp', async (c) => {
  logger.info('Received MCP request');
  try {
    const requestBody = await c.req.json();
    logger.debug('Request body: %s', JSON.stringify(requestBody));

    await initializeServer();
    const { req, res } = toReqRes(c.req.raw);

    await transport.handleRequest(req, res, requestBody);

    res.on("close", () => {
      logger.debug('Request closed');
    });

    const response = toFetchResponse(res);
    logger.debug('Response: %s', JSON.stringify(response));
    return response;
  } catch (error) {
    logger.error({ error }, 'Error handling MCP request');
    return c.json(createErrorResponse(-32603, "Internal server error"), { status: 500 });
  }
});

// Handle unsupported methods
app.get('/mcp', async (c) => {
  logger.info("Received GET MCP request");
  return c.json(createErrorResponse(-32000, "Method not allowed."), { status: 405 });
});

app.delete('/mcp', async (c) => {
  logger.info("Received DELETE MCP request");
  return c.json(createErrorResponse(-32000, "Method not allowed."), { status: 405 });
});

// Health check endpoint
app.get('/health', async (c) => {
  logger.debug("Received health check request");
  return c.json({
    status: "ok",
    service: pkg.name,
    version: pkg.version,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime())
  }, { status: 200 });
});

// Default port for when running directly
const DEFAULT_PORT = 4000;

export async function startServer(port?: number) {
  // Only start the server if we're not in Lambda
  if (process.env.AWS_LAMBDA_FUNCTION_NAME === undefined) {
    try {
      // Initialize server and connect to transport
      await initializeServer();
      
      const serverPort = port || parseInt(process.env.PORT || DEFAULT_PORT.toString());
      logger.info('ArcGIS MCP Streamable HTTP Server starting on port %d', serverPort);
      
      const server = Bun.serve({
        fetch: app.fetch,
        port: serverPort,
        reusePort: true,
      });

      logger.info('ArcGIS MCP Streamable HTTP Server listening on port %d', serverPort);
      return server;
    } catch (error) {
      logger.error({ err: error }, 'Failed to set up the server');
      process.exit(1);
    }
  }
  
  return undefined;
}

// Start the server if this file is run directly
if (import.meta.main) {
  startServer();
} 
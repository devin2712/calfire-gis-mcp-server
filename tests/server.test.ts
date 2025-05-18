import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startServer } from '../src/index';

const TEST_PORT = process.env.TEST_PORT ? parseInt(process.env.TEST_PORT, 10) : 4000;

describe('MCP Server', () => {
  let httpServer: any;

  beforeAll(async () => {
    // Start the actual server for HTTP tests
    httpServer = await startServer(TEST_PORT);
  });

  afterAll(() => {
    if (httpServer) {
      httpServer.stop();
    }
  });

  test('server should handle POST requests to /mcp', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'fetch_fire_damage_assessment_for_address',
        params: {
          address: {
            street: '123 Test St',
            city: 'Los Angeles',
            state: 'CA',
            zip: '90001'
          }
        },
        id: 1
      })
    });

    const responseText = await response.text();

    expect(response.status).toBe(200);
    
    // Parse SSE response
    const data = JSON.parse(responseText.match(/data: (.+)/)?.[1] ?? '{}');
    expect(data).toHaveProperty('jsonrpc', '2.0');
    
    // Verify the response has the expected content format
    if (data.result) {
      expect(data.result).toHaveProperty('content');
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content.length).toBeGreaterThan(0);
      
      const content = data.result.content[0];
      expect(content).toHaveProperty('type', 'json');
      expect(content).toHaveProperty('json');
      
      // Verify the assessment data structure
      const assessment = content.json;
      expect(assessment).toHaveProperty('coordinates');
      expect(assessment).toHaveProperty('evacuationZone');
      expect(assessment).toHaveProperty('parcel');
      expect(assessment).toHaveProperty('damageAssessments');
      expect(assessment).toHaveProperty('address');
    }
  });

  test('server should reject GET requests to /mcp', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'GET'
    });

    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error.code).toBe(-32000);
  });

  test('server should reject DELETE requests to /mcp', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'DELETE'
    });

    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error.code).toBe(-32000);
  });

  test('server should handle invalid JSON requests', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json'
    });

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toHaveProperty('error');
    expect(data.error.code).toBe(-32603);
  });
}); 
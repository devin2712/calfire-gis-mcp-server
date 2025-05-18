import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { app } from './index.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // Convert API Gateway event to Hono request
  const headers = event.headers ? 
    Object.entries(event.headers).reduce((acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>) : 
    {};

  // Construct the full URL
  const host = event.requestContext.domainName || 'localhost';
  const protocol = event.requestContext.protocol?.toLowerCase().startsWith('http') ? 'https' : 'http';
  const url = `${protocol}://${host}${event.path}`;

  const request = new Request(url, {
    method: event.httpMethod,
    headers: headers,
    body: event.body ? event.body : undefined,
  });

  // Handle the request using Hono
  const response = await app.fetch(request);
  
  // Convert Hono response to API Gateway response
  const body = await response.text();
  
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: body,
  };
}; 
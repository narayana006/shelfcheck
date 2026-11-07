// The PayPal client id is public by design (it loads the JS SDK); the secret never leaves the server.
export function GET() {
  return Response.json({ clientId: process.env.PAYPAL_CLIENT_ID ?? null });
}

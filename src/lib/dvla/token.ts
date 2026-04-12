import "server-only";

import { serverEnv } from "@/lib/env";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Fetch an OAuth2 access token from Azure AD using client_credentials grant.
 * Caches the token in memory until 60s before expiry.
 */
export async function getDvsaAccessToken(): Promise<string> {
  const env = serverEnv();

  if (!env.DVSA_CLIENT_ID || !env.DVSA_CLIENT_SECRET || !env.DVSA_TENANT_ID) {
    throw new Error("DVSA OAuth2 credentials not configured");
  }

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const tokenUrl = `https://login.microsoftonline.com/${env.DVSA_TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.DVSA_CLIENT_ID,
    client_secret: env.DVSA_CLIENT_SECRET,
  });

  if (env.DVSA_SCOPE) {
    params.set("scope", env.DVSA_SCOPE);
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[dvsa] Token exchange failed:", res.status, text);
    throw new Error(`DVSA token exchange failed: ${res.status}`);
  }

  const data = await res.json();
  const expiresIn = (data.expires_in as number) ?? 3600;

  cachedToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return cachedToken.token;
}

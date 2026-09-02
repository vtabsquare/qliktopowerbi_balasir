export async function handleVtabSso(request: Request, runtimeEnv: RuntimeEnv) {
  try {
    const body = await readJsonBody(request);
    const token = body?.token;
    if (typeof token !== 'string') return jsonResponse({ error: "Missing token" }, { status: 400 });

    const secret = runtimeEnv.VTAB_SSO_SECRET;
    if (!secret) return jsonResponse({ error: "Server SSO configuration missing" }, { status: 500 });

    const parts = token.split(".");
    if (parts.length !== 3) return jsonResponse({ error: "Invalid token format" }, { status: 400 });
    const [headerB64, payloadB64, signatureB64] = parts;

    const pad = (s: string) => s + '='.repeat((4 - s.length % 4) % 4);
    const b64url2b64 = (s: string) => pad(s.replace(/-/g, "+").replace(/_/g, "/"));

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureBytes = Uint8Array.from(atob(b64url2b64(signatureB64)), c => c.charCodeAt(0));
    const data = encoder.encode(headerB64 + "." + payloadB64);
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, data);

    if (!isValid) return jsonResponse({ error: "Invalid signature" }, { status: 401 });

    const decoded = JSON.parse(atob(b64url2b64(payloadB64)));
    if (decoded.purpose !== "vtab_sso") return jsonResponse({ error: "Invalid token purpose" }, { status: 400 });

    const email = normalizeEmail(decoded.email);

    // 1. Verify user exists in Supabase
    const supabaseUrl = runtimeEnv.SUPABASE_URL || runtimeEnv.VITE_SUPABASE_URL;
    const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Server DB misconfiguration" }, { status: 500 });

    const usersRes = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`, {
      method: "GET",
      headers: { "authorization": `Bearer ${serviceRoleKey}`, "apikey": serviceRoleKey }
    });
    if (!usersRes.ok) throw new Error("Could not list users");
    const { users } = await usersRes.json();
    const exists = users.some((u: any) => u.email === email);
    if (!exists) return jsonResponse({ error: "SSO user is not registered in QlikToPowerBI." }, { status: 403 });

    // 2. Generate Magic Link
    const linkRes = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { "authorization": `Bearer ${serviceRoleKey}`, "apikey": serviceRoleKey, "content-type": "application/json" },
      body: JSON.stringify({ 
          type: "magiclink", 
          email,
          options: {
              redirect_to: "https://qlik-to-pbi-bridge.onrender.com"
          }
      })
    });
    
    if (!linkRes.ok) throw new Error("Could not generate login link");
    const linkData = await linkRes.json();
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) throw new Error("Missing action_link");

    return jsonResponse({ success: true, magicLink: actionLink });
  } catch (e) {
    return jsonResponse({ error: "SSO verification failed." }, { status: 400 });
  }
}

import { createClient } from "@supabase/supabase-js";
import { createCookie, redirect } from "react-router";
import { supabaseAdmin } from "./supabase.server";
import {
  allPermissions,
  permissionLabels,
  type UserPermission,
} from "./user-permissions";

const cookieSecret =
  process.env.USER_AUTH_COOKIE_SECRET ||
  process.env.QUOTE_ACCESS_COOKIE_SECRET ||
  "dev-secret-change-me";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAuthKey =
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const userAuthCookie = createCookie("contractor_user_session", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: true,
  secrets: [cookieSecret],
  maxAge: 60 * 60 * 24 * 7,
});

export type AppUserProfile = {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: UserPermission[];
  isActive: boolean;
};

type StoredSession = {
  access_token: string;
  refresh_token: string;
};

function getDefaultPermissions(role: string): UserPermission[] {
  if (role === "admin") return [...allPermissions];
  if (role === "dispatcher") {
    return ["quoteTool", "reviewQuotes", "dispatch", "driver", "manageDispatch"];
  }
  if (role === "driver") return ["driver"];
  return ["quoteTool"];
}

function normalizePermissions(value: unknown, role: string): UserPermission[] {
  const raw = Array.isArray(value) ? value : getDefaultPermissions(role);
  const allowed = new Set(allPermissions);
  return raw.filter((permission): permission is UserPermission =>
    allowed.has(permission as UserPermission),
  );
}

function normalizeProfile(row: any): AppUserProfile {
  const role = String(row?.role || "user");
  return {
    id: String(row?.id || ""),
    email: String(row?.email || ""),
    name: String(row?.name || ""),
    role,
    permissions: normalizePermissions(row?.permissions, role),
    isActive: row?.is_active !== false,
  };
}

function getAuthClient() {
  if (!supabaseUrl || !supabaseAuthKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  return createClient(supabaseUrl, supabaseAuthKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function signInContractorUser(email: string, password: string) {
  const client = getAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user?.email) {
    throw new Error(error?.message || "Unable to sign in.");
  }

  const profile = await ensureUserProfile({
    id: data.user.id,
    email: data.user.email,
    name:
      String(data.user.user_metadata?.name || data.user.user_metadata?.full_name || "") ||
      data.user.email,
  });

  if (!profile.isActive) {
    throw new Error("This user is disabled.");
  }

  return {
    cookie: await userAuthCookie.serialize({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    } satisfies StoredSession),
    profile,
  };
}

export async function getCurrentUser(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  const session = (await userAuthCookie.parse(cookieHeader)) as StoredSession | null;
  if (!session?.access_token || !session?.refresh_token) return null;

  const client = getAuthClient();
  const { data, error } = await client.auth.setSession(session);
  if (error || !data.user?.id) return null;

  const profile = await ensureUserProfile({
    id: data.user.id,
    email: data.user.email || "",
    name:
      String(data.user.user_metadata?.name || data.user.user_metadata?.full_name || "") ||
      data.user.email ||
      "",
  });

  if (!profile.isActive) return null;
  return profile;
}

export async function hasUserPermission(request: Request, permission: UserPermission) {
  const user = await getCurrentUser(request);
  return Boolean(user?.permissions.includes(permission));
}

export async function requireUserPermission(
  request: Request,
  permission: UserPermission,
  redirectTo = "/login",
) {
  const user = await getCurrentUser(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`${redirectTo}?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  if (!user.permissions.includes(permission)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}

export async function ensureUserProfile(input: {
  id: string;
  email: string;
  name?: string;
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("app_user_profiles")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();

  if (existingError?.code !== "42P01" && existingError) {
    throw new Error(existingError.message);
  }

  if (existing) return normalizeProfile(existing);

  const { count, error: countError } = await supabaseAdmin
    .from("app_user_profiles")
    .select("id", { count: "exact", head: true });

  if (countError?.code === "42P01") {
    throw new Error("App user profile storage is not ready. Run supabase_auth_schema.sql.");
  }
  if (countError) throw new Error(countError.message);

  const role = count === 0 ? "admin" : "user";
  const permissions = getDefaultPermissions(role);
  const { data, error } = await supabaseAdmin
    .from("app_user_profiles")
    .insert({
      id: input.id,
      email: input.email,
      name: input.name || input.email,
      role,
      permissions,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return normalizeProfile(data);
}

export async function listAppUsers() {
  const { data, error } = await supabaseAdmin
    .from("app_user_profiles")
    .select("*")
    .order("email", { ascending: true });

  if (error?.code === "42P01") return [];
  if (error) throw new Error(error.message);
  return (data || []).map(normalizeProfile);
}

export async function updateAppUserProfile(input: {
  id: string;
  name: string;
  role: string;
  permissions: string[];
  isActive: boolean;
}) {
  const permissions = normalizePermissions(input.permissions, input.role);
  const { data, error } = await supabaseAdmin
    .from("app_user_profiles")
    .update({
      name: input.name,
      role: input.role,
      permissions,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return normalizeProfile(data);
}

export async function createAppUser(input: {
  email: string;
  password: string;
  name: string;
  role: string;
  permissions: string[];
}) {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });

  if (error || !created.user) {
    throw new Error(error?.message || "Unable to create user.");
  }

  const permissions = normalizePermissions(input.permissions, input.role);
  const { data, error: profileError } = await supabaseAdmin
    .from("app_user_profiles")
    .upsert({
      id: created.user.id,
      email: input.email,
      name: input.name || input.email,
      role: input.role,
      permissions,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (profileError) throw new Error(profileError.message);
  return normalizeProfile(data);
}

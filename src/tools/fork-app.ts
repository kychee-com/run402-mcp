import { z } from "zod";
import { apiRequest } from "../client.js";
import { saveProject, setActiveProjectId } from "../keystore.js";
import { formatApiError } from "../errors.js";
import { requireAllowanceAuth } from "../allowance-auth.js";

export const forkAppSchema = {
  version_id: z.string().describe("The app version ID to fork (from browse_apps)"),
  name: z.string().describe("Name for the new forked project"),
  subdomain: z
    .string()
    .optional()
    .describe("Optional subdomain to claim for the forked app"),
};

export async function handleForkApp(args: {
  version_id: string;
  name: string;
  subdomain?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const auth = requireAllowanceAuth("/fork/v1");
  if ("error" in auth) return auth.error;

  const res = await apiRequest("/fork/v1", {
    method: "POST",
    headers: { ...auth.headers },
    body: {
      version_id: args.version_id,
      name: args.name,
      subdomain: args.subdomain,
    },
  });

  if (!res.ok) return formatApiError(res, "forking app");

  const body = res.body as {
    project_id: string;
    anon_key: string;
    service_key: string;
    schema_slot: string;
    site_url?: string;
    subdomain_url?: string;
    functions?: Array<{ name: string; url: string }>;
  };

  // Save credentials to local key store and set as active project
  saveProject(body.project_id, {
    anon_key: body.anon_key,
    service_key: body.service_key,
  });
  setActiveProjectId(body.project_id);

  const lines = [
    `## App Forked: ${args.name}`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| project_id | \`${body.project_id}\` |`,
    `| schema | ${body.schema_slot} |`,
  ];

  if (body.site_url) {
    lines.push(`| site | ${body.site_url} |`);
  }
  if (body.subdomain_url) {
    lines.push(`| subdomain | ${body.subdomain_url} |`);
  }

  lines.push(``);
  lines.push(`Keys saved to local key store.`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}

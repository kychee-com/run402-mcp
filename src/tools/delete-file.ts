import { z } from "zod";
import { apiRequest } from "../client.js";
import { getProject } from "../keystore.js";
import { formatApiError, projectNotFound } from "../errors.js";

export const deleteFileSchema = {
  project_id: z.string().describe("The project ID"),
  bucket: z.string().describe("Storage bucket name"),
  path: z.string().describe("File path within the bucket"),
};

export async function handleDeleteFile(args: {
  project_id: string;
  bucket: string;
  path: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const project = getProject(args.project_id);
  if (!project) return projectNotFound(args.project_id);

  const apiPath = `/storage/v1/object/${args.bucket}/${args.path}`;

  const res = await apiRequest(apiPath, {
    method: "DELETE",
    headers: {
      apikey: project.anon_key,
      Authorization: `Bearer ${project.anon_key}`,
    },
  });

  if (!res.ok) return formatApiError(res, "deleting file");

  return {
    content: [
      {
        type: "text",
        text: `File \`${args.bucket}/${args.path}\` deleted.`,
      },
    ],
  };
}

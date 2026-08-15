import { githubRepositoryFromRow } from "./service";
import type { GitHubResourceRow } from "./types";

const ROW: GitHubResourceRow = {
  id: "resource-id",
  connection_id: "connection-id",
  resource_type: "github_repository",
  resource_ref: "octo/private-repo",
  display_name: "octo/private-repo",
  permission_level: "write",
  discovered_at: "2026-08-15T00:00:00Z",
  created_at: "2026-08-15T00:00:00Z",
  updated_at: "2026-08-15T00:00:00Z",
  deleted_at: null,
  metadata: {
    html_url: "https://github.com/octo/private-repo",
    clone_url: "https://github.com/octo/private-repo.git",
    default_branch: "main",
    private: true,
    archived: false,
  },
};

describe("GitHub repository inventory", () => {
  test("projects safe database metadata into a cloneable repository", () => {
    expect(githubRepositoryFromRow(ROW)).toEqual({
      id: "octo/private-repo",
      fullName: "octo/private-repo",
      htmlUrl: "https://github.com/octo/private-repo",
      cloneUrl: "https://github.com/octo/private-repo.git",
      defaultBranch: "main",
      private: true,
      archived: false,
      permissionLevel: "write",
    });
  });

  test("fails loudly when required clone metadata is missing", () => {
    expect(() => githubRepositoryFromRow({ ...ROW, metadata: {} })).toThrow(
      "missing required html_url",
    );
  });
});

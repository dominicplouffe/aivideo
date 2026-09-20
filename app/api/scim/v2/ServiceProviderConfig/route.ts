import { scimJson } from "@/lib/auth/scim/http";

/**
 * What this SCIM implementation actually supports.
 *
 * Directories read this before their first sync and adjust what they send.
 * Claiming support for something we do not have is worse than declaring the
 * gap: Okta will happily use bulk operations if told they exist, and then
 * every offboarding fails.
 *
 * So: no bulk, no sort, no password change, and filtering declared as
 * supported because the one filter every directory sends — `userName eq` —
 * is handled. Everything else in the filter grammar is refused explicitly
 * rather than silently returning the wrong set.
 */
export const dynamic = "force-static";

export async function GET() {
  return scimJson({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://demoriff.com/docs/scim",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "A workspace-scoped token issued in workspace settings.",
        primary: true,
      },
    ],
    meta: { resourceType: "ServiceProviderConfig", location: "/api/scim/v2/ServiceProviderConfig" },
    // Both resources are served. Declaring one a directory then tries to use
    // for the other is how a sync half-works.
    resourceTypes: ["User", "Group"],
  });
}

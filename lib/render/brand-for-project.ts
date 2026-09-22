import type { Project } from "@/lib/app-data";
import { resolveBrand } from "@/lib/brand";
import { getBrandKit } from "@/lib/db/repositories/brand-kits";
import { brandForRender, type EdlBrand } from "./edl";

/**
 * The kit a project wears, resolved for the encoder.
 *
 * One function for the two places an EDL is built — the export route,
 * which builds it when the button is pressed, and the worker's fallback
 * for a job that arrived without one. The first version of this lived only
 * in the worker, so every export from the Studio went out plain.
 *
 * `locked` comes back too: a locked kit keeps captions on whatever the
 * Studio's switch says.
 */
export async function brandForProject(
  workspaceId: string,
  project: Pick<Project, "brandKitId" | "title">,
): Promise<{ brand: EdlBrand | undefined; kitId: string | null; locked: boolean }> {
  if (!project.brandKitId) return { brand: undefined, kitId: null, locked: false };
  const kit = await getBrandKit(workspaceId, project.brandKitId);
  if (!kit) return { brand: undefined, kitId: null, locked: false };
  const resolved = resolveBrand(kit.tokens);
  return {
    brand: brandForRender(resolved, {
      // Not a signed URL: the worker reads storage directly, like the take.
      logoUrl: resolved.logo ? `storage://${workspaceId}/${resolved.logo.key}` : null,
      title: project.title,
    }),
    kitId: kit.id,
    locked: kit.locked,
  };
}

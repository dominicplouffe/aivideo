import type { Metadata } from "next";
import { PageHeader } from "@/components/app/Shared";
import { BrandKitsEditor, type KitRecord } from "@/components/app/brand/BrandKitsEditor";
import { getBrandKits, getWorkspace, viewerMay } from "@/lib/data";

export const metadata: Metadata = { title: "Brand kits" };

/**
 * Brand kits, from the `brand_kits` table.
 *
 * A kit is a logo, three colours, a typeface, a caption style and the lines
 * on an intro and outro card. A project points at one in the Studio, and
 * from then on its renders carry the kit's captions, logo and cards, and
 * its share page carries the logo and accent colour.
 *
 * This page once rendered a three-kit fixture on every workspace and, for a
 * while after that, the real table with no way to write to it. Both of
 * those states are gone: what is here is the workspace's, and it is edited
 * here.
 */
export default async function BrandPage() {
  const [kits, canEdit, workspace] = await Promise.all([getBrandKits(), viewerMay("brand.edit"), getWorkspace()]);
  const inheriting = kits.reduce((n, k) => n + k.usedBy, 0);

  return (
    <>
      <PageHeader
        title="Brand kits"
        description={
          kits.length === 0
            ? "Your logo, colours and typeface, applied to the captions, cards and share page of every export that uses a kit. This workspace has none yet, so exports look like the footage as recorded."
            : `Your logo, colours and typeface, applied to every export that uses a kit. ${inheriting} ${
                inheriting === 1 ? "project uses" : "projects use"
              } one; change the kit and their next export picks it up.`
        }
      />
      <BrandKitsEditor initialKits={kits as KitRecord[]} canEdit={canEdit} workspaceName={workspace?.name ?? "Brand kit"} />
    </>
  );
}

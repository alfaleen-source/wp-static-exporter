export const MANAGED_BLOB_PREFIXES=["exports/","repairs/","cleanups/","cleanup-inputs/"] as const;
export type ManagedBlobKind="Full export"|"Repair patch"|"Cleaned export"|"Temporary upload";

export function managedBlobKind(pathname:string):ManagedBlobKind|undefined {
  if(pathname.startsWith("exports/"))return "Full export";
  if(pathname.startsWith("repairs/"))return "Repair patch";
  if(pathname.startsWith("cleanups/"))return "Cleaned export";
  if(pathname.startsWith("cleanup-inputs/"))return "Temporary upload";
  return undefined;
}

export function assertManagedDeletion(requested:unknown,currentPathnames:Set<string>) {
  if(!Array.isArray(requested)||requested.length<1||requested.length>50||requested.some((value)=>typeof value!=="string"))throw new Error("Select between 1 and 50 stored files to delete.");
  const unique=[...new Set(requested as string[])];
  if(unique.length!==requested.length)throw new Error("The deletion selection contains duplicate files.");
  for(const pathname of unique)if(!managedBlobKind(pathname)||!currentPathnames.has(pathname))throw new Error(`Deletion refused for an unmanaged or stale file: ${pathname}`);
  return unique;
}

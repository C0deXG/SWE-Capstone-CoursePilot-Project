export const courseFileAccept = ".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg";
export const maximumCourseFileSize = 16 * 1024 * 1024;
export const maximumFolderFiles = 200;

const supportedFilePattern = /\.(pdf|docx|pptx|txt|png|jpe?g)$/i;

function readDroppedFile(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectory(entry: FileSystemDirectoryEntry) {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return entries;
    entries.push(...batch);
  }
}

async function collectDroppedFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return [await readDroppedFile(entry as FileSystemFileEntry)];
  if (!entry.isDirectory) return [];
  const children = await readDirectory(entry as FileSystemDirectoryEntry);
  return (await Promise.all(children.map(collectDroppedFiles))).flat();
}

export async function filesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  return entries.length
    ? (await Promise.all(entries.map(collectDroppedFiles))).flat()
    : Array.from(dataTransfer.files);
}

export function prepareCourseFiles(files: File[]) {
  const unique = [...new Map(files.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file])).values()];
  const accepted = unique
    .filter((file) => supportedFilePattern.test(file.name) && file.size <= maximumCourseFileSize)
    .slice(0, maximumFolderFiles);
  return { accepted, skipped: files.length - accepted.length };
}

export function isSyllabusFilename(filename: string) {
  return filename.toLowerCase().includes("syllabus");
}

function processingGroup(filename: string) {
  const value = filename.toLowerCase();
  if (isSyllabusFilename(value)) return 0;
  if (/(schedule|calendar)/.test(value)) return 1;
  if (/(assignment|homework|sprint|project|exam|quiz)/.test(value)) return 2;
  if (/rubric/.test(value)) return 3;
  return 4;
}

export function orderCourseFiles(files: File[]) {
  return [...files].sort((left, right) => {
    const groupDifference = processingGroup(left.name) - processingGroup(right.name);
    return groupDifference || left.name.localeCompare(right.name);
  });
}

export function processingOrderForFilename(filename: string, position = 0) {
  return processingGroup(filename) * 1000 + position;
}

export function courseFileUploadNotice(accepted: number, skipped: number) {
  if (!skipped) return `${accepted} file${accepted === 1 ? "" : "s"} added.`;
  return `${accepted} file${accepted === 1 ? "" : "s"} added. ${skipped} unsupported, oversized, duplicate, or extra file${skipped === 1 ? " was" : "s were"} skipped.`;
}

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

const SUPPORTED_EXTENSIONS = ["pdf", "txt", "md", "docx"] as const;
type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export class UnsupportedFileError extends Error {}
export class FileTooLargeError extends Error {}

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function isSupportedExtension(extension: string): extension is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(extension);
}

async function extractText(buffer: Buffer, extension: SupportedExtension): Promise<string> {
  switch (extension) {
    case "txt":
    case "md":
      return buffer.toString("utf-8");
    case "pdf": {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    case "docx": {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
  }
}

export interface ExtractedFile {
  fileName: string;
  text: string;
}

export async function extractFiles(files: File[]): Promise<ExtractedFile[]> {
  let totalSize = 0;
  const extracted: ExtractedFile[] = [];

  for (const file of files) {
    const extension = getExtension(file.name);
    if (!isSupportedExtension(extension)) {
      throw new UnsupportedFileError(
        `Formato de arquivo não suportado: "${file.name}". Formatos aceitos: ${SUPPORTED_EXTENSIONS.join(", ")}.`
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new FileTooLargeError(
        `Arquivo "${file.name}" excede o limite de ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
      );
    }
    totalSize += file.size;
    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
      throw new FileTooLargeError(
        `O total de arquivos excede o limite de ${MAX_TOTAL_SIZE_BYTES / (1024 * 1024)}MB.`
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractText(buffer, extension);
    extracted.push({ fileName: file.name, text });
  }

  return extracted;
}

export function formatExtractedFilesText(files: ExtractedFile[]): string {
  return files
    .map((file) => `### Arquivo: ${file.fileName}\n${file.text}`)
    .join("\n\n");
}

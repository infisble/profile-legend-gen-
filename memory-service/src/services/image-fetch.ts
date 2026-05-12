import { HttpError } from "../errors";

function normalizeMimeType(value: string | null, url: string): string {
  if (value && value.includes("/")) {
    return value.split(";")[0].trim();
  }

  const lowered = url.toLowerCase();

  if (lowered.endsWith(".png")) {
    return "image/png";
  }

  if (lowered.endsWith(".webp")) {
    return "image/webp";
  }

  return "image/jpeg";
}

export async function downloadImageAsInlinePart(photoUrl: string): Promise<{
  inlineData: {
    data: string;
    mimeType: string;
  };
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(photoUrl, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new HttpError(502, `Could not download image from ${photoUrl}.`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = normalizeMimeType(response.headers.get("content-type"), photoUrl);

    return {
      inlineData: {
        data: Buffer.from(arrayBuffer).toString("base64"),
        mimeType
      }
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(502, `Image download failed for ${photoUrl}.`);
  } finally {
    clearTimeout(timeout);
  }
}

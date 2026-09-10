/**
 * Utility helper for parsing and normalizing video URLs for web embedding.
 * Specially optimized for Google Drive POV & Packing videos.
 */

/**
 * Extracts the Google Drive File ID from various link formats:
 * - https://drive.google.com/file/d/1A2b3C4d5E6F7g8H9/view?usp=sharing
 * - https://drive.google.com/file/d/1A2b3C4d5E6F7g8H9/view
 * - https://drive.google.com/file/d/1A2b3C4d5E6F7g8H9
 * - https://drive.google.com/open?id=1A2b3C4d5E6F7g8H9
 * - https://drive.google.com/uc?id=1A2b3C4d5E6F7g8H9
 * - 1A2b3C4d5E6F7g8H9 (raw ID)
 */
export function extractGoogleDriveFileId(url) {
  if (!url || typeof url !== 'string') return null;
  const cleanUrl = url.trim();

  // Format 1: /file/d/{FILE_ID}
  const fileDMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileDMatch && fileDMatch[1]) return fileDMatch[1];

  // Format 2: ?id={FILE_ID} or &id={FILE_ID}
  const idParamMatch = cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idParamMatch && idParamMatch[1]) return idParamMatch[1];

  // Format 3: Google Drive raw ID check (typically 25-55 alphanumeric characters with _ or -)
  if (/^[a-zA-Z0-9_-]{25,55}$/.test(cleanUrl)) {
    return cleanUrl;
  }

  return null;
}

/**
 * Checks if a given URL is a Google Drive URL
 */
export function isGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /drive\.google\.com/i.test(url) || /docs\.google\.com/i.test(url) || Boolean(extractGoogleDriveFileId(url));
}

/**
 * Checks if a given URL is a YouTube URL (Shorts, regular watch, or youtu.be)
 */
export function isYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

/**
 * Converts any supported video URL (Google Drive, YouTube, Vimeo, direct MP4)
 * into a safe embeddable iframe URL.
 */
export function getEmbedVideoUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();

  // 1. Google Drive: Must use /preview to avoid X-Frame-Options: SAMEORIGIN
  const driveId = extractGoogleDriveFileId(cleanUrl);
  if (driveId && (isGoogleDriveUrl(cleanUrl) || driveId.length >= 25)) {
    return `https://drive.google.com/file/d/${driveId}/preview`;
  }

  // Reject dangerous pseudo-protocols (javascript:, data:, vbscript:)
  const lower = cleanUrl.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return '';
  }

  // Enforce strictly http:// or https:// protocol
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return '';
  }

  // 2. YouTube Shorts: https://www.youtube.com/shorts/{VIDEO_ID}
  const ytShortsMatch = cleanUrl.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (ytShortsMatch && ytShortsMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${ytShortsMatch[1]}?rel=0&autoplay=0`;
  }

  // 3. YouTube Watch: https://www.youtube.com/watch?v={VIDEO_ID}
  const ytWatchMatch = cleanUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/i);
  if (ytWatchMatch && ytWatchMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${ytWatchMatch[1]}?rel=0&autoplay=0`;
  }

  // 4. Vimeo
  const vimeoMatch = cleanUrl.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch && vimeoMatch[1]) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  // 5. Default return as-is (e.g. direct mp4 or already an embed URL)
  return cleanUrl;
}

/**
 * Checks if the video URL needs an iframe embed rather than a native <video> tag
 */
export function isEmbeddableVideo(url) {
  if (!url || typeof url !== 'string') return false;
  return isGoogleDriveUrl(url) || isYouTubeUrl(url) || /vimeo\.com/i.test(url) || url.includes('/preview') || url.includes('/embed');
}

/**
 * Converts image URLs, particularly Google Drive share links, into direct image URLs
 * that can be loaded directly inside <img src="..." /> tags without CORS or HTML page wrapper issues.
 */
export function getDirectImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const driveId = extractGoogleDriveFileId(cleanUrl);
  if (driveId && (isGoogleDriveUrl(cleanUrl) || driveId.length >= 25)) {
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }
  return cleanUrl;
}

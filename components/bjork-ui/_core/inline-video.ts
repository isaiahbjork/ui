// Every <video> on the site is decoration or a texture source: it plays muted,
// inline, and never in the phone's native player.
//
// iOS in-app browsers (X, Instagram, Facebook, LinkedIn, TikTok...) are
// WKWebViews, and a WKWebView only plays inline when the host app opts in
// (allowsInlineMediaPlayback). When it hasn't, `play()` opens the fullscreen
// player whatever attributes the element carries, and a preview loop that
// re-plays a paused clip reopens it every time it is dismissed. So in those
// browsers the site never calls `play()` on its own: tiles show their poster
// frame and texture sources stay still. Everywhere else the attributes below
// keep playback inline, and a fullscreen guard backs them up.

type WebkitVideo = HTMLVideoElement & {
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
  webkitSetPresentationMode?: (mode: string) => void;
  disableRemotePlayback?: boolean;
  disablePictureInPicture?: boolean;
};

// App tokens the in-app browsers add to the user agent.
const IN_APP = /Twitter|FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|musical_ly|BytedanceWebview|TikTok|Line\/|Pinterest/i;

let blocked: boolean | null = null;

/**
 * True where `play()` may open the native fullscreen player: an iPhone/iPod
 * in-app browser, or any iOS web view without Safari's UA token (a bare
 * WKWebView). Safari, Chrome iOS (CriOS ... Safari/) and SFSafariViewController
 * all carry the token and play inline.
 */
export function inlineVideoBlocked() {
  if (blocked !== null) return blocked;
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  blocked = ios && (IN_APP.test(ua) || !/Safari\//.test(ua));
  return blocked;
}

/**
 * Mark a video inline-only. Call it before `src` is set: some web views read
 * `playsinline` when the source loads, not when `play()` is called.
 * Returns a cleanup that removes the fullscreen guard.
 */
export function makeInlineVideo(element: HTMLVideoElement) {
  const video = element as WebkitVideo;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("disablepictureinpicture", "");
  video.setAttribute("disableremoteplayback", "");
  video.setAttribute("x-webkit-airplay", "deny");
  video.removeAttribute("controls");
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  // A tap that lands on the video itself can be read as "open the player".
  video.style.pointerEvents = "none";

  // Last resort: if the native player opens anyway, close it, stop the clip,
  // and never auto-play this element again (a loop re-playing it would only
  // reopen the player).
  const leave = () => {
    video.dataset.inlineBlocked = "1";
    video.pause();
    try {
      if (video.webkitPresentationMode && video.webkitPresentationMode !== "inline") {
        video.webkitSetPresentationMode?.("inline");
      }
      video.webkitExitFullscreen?.();
    } catch {}
    if (typeof document !== "undefined" && document.fullscreenElement === video) {
      void document.exitFullscreen?.().catch(() => {});
    }
  };
  const onPresentation = () => {
    if (video.webkitPresentationMode && video.webkitPresentationMode !== "inline") leave();
  };
  const onFullscreen = () => {
    if (typeof document !== "undefined" && document.fullscreenElement === video) leave();
  };
  video.addEventListener("webkitbeginfullscreen", leave);
  video.addEventListener("webkitpresentationmodechanged", onPresentation);
  video.addEventListener("enterpictureinpicture", leave);
  video.addEventListener("fullscreenchange", onFullscreen);
  video.addEventListener("webkitfullscreenchange", onFullscreen);
  return () => {
    video.removeEventListener("webkitbeginfullscreen", leave);
    video.removeEventListener("webkitpresentationmodechanged", onPresentation);
    video.removeEventListener("enterpictureinpicture", leave);
    video.removeEventListener("fullscreenchange", onFullscreen);
    video.removeEventListener("webkitfullscreenchange", onFullscreen);
  };
}

/** True when this element may be played: inline playback is possible and the guard hasn't tripped. */
export function canPlayInline(video: HTMLVideoElement) {
  return !inlineVideoBlocked() && video.dataset.inlineBlocked !== "1";
}

/** `play()` only where it stays inline; resolves either way. */
export function playInline(video: HTMLVideoElement) {
  if (!canPlayInline(video)) return;
  void video.play().catch(() => {});
}

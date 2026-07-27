(() => {
  "use strict";

  // Bump this on every push. Set from JS (not static HTML) so a stale
  // cached script.js shows its OLD number even if index.html is fresh —
  // makes browser-cache mismatches obvious instead of silently hiding them.
  const BUILD_VERSION = "v12";
  const buildTagEl = document.getElementById("buildTag");
  if (buildTagEl) buildTagEl.textContent = BUILD_VERSION;

  /* =========================================================
     i18n
  ========================================================= */
  const dict = {
    ja: {
      siteTitle: "原神・スタレ画面メーカー",
      langJa: "日本語",
      langEn: "English",
      tabGenshin: "原神",
      tabStarrail: "崩壊：スターレイル",
      btnLoadImage: "画像読み込み",
      btnChangeImage: "画像を変更",
      btnSaveImage: "Save Image",
      inputPanelTitle: "テキスト入力",
      labelName: "話者名",
      placeholderName: "例: キャサリン",
      labelSubtitle: "役職 / サブタイトル(任意)",
      placeholderSubtitle: "例: 冒険者協会の受付係",
      labelBody: "セリフ本文",
      placeholderBody: "例: ようこそ、冒険者協会へ。何かお手伝いできることはありますか?",
      labelUid: "UID(任意)",
      placeholderUid: "例: 801728912",
      dropHint: "画像をここにドラッグ&ドロップ<br>または上の「画像読み込み」から選択してください",
      comingSoon: "崩壊：スターレイルは近日対応予定です",
      placeholderNameSr: "例: ウェンウェン",
      placeholderBodySr: "例: またお会いしましたね。",
      placeholderUidSr: "例: 833234573",
    },
    en: {
      siteTitle: "Genshin / Star Rail Screen Maker",
      langJa: "Japanese",
      langEn: "English",
      tabGenshin: "Genshin",
      tabStarrail: "Honkai: Star Rail",
      btnLoadImage: "Load Image",
      btnChangeImage: "Change Image",
      btnSaveImage: "Save Image",
      inputPanelTitle: "Text Input",
      labelName: "Speaker Name",
      placeholderName: "e.g. Katheryne",
      labelSubtitle: "Title / Subtitle (optional)",
      placeholderSubtitle: "e.g. Adventurers' Guild Receptionist",
      labelBody: "Dialogue Text",
      placeholderBody: "e.g. Welcome to the Adventurers' Guild. How can I help you?",
      labelUid: "UID (optional)",
      placeholderUid: "e.g. 801728912",
      dropHint: "Drag & drop an image here<br>or select one via \"Load Image\" above",
      comingSoon: "Honkai: Star Rail support is coming soon",
      placeholderNameSr: "e.g. Wenwen",
      placeholderBodySr: "e.g. We meet again.",
      placeholderUidSr: "e.g. 833234573",
    },
  };

  function applyLang(lang) {
    const d = dict[lang] || dict.ja;
    localStorage.setItem("lang", lang);

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (Object.prototype.hasOwnProperty.call(d, key)) {
        el.innerHTML = d[key];
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (Object.prototype.hasOwnProperty.call(d, key)) {
        el.setAttribute("placeholder", d[key]);
      }
    });

    // 画像読み込み後は「画像読み込み」→「画像を変更」の文言に切り替え済みなので上書きしない
    const loadText = document.getElementById("loadImageText");
    if (loadText && !img) {
      loadText.textContent = d.btnLoadImage;
    } else if (loadText && img) {
      loadText.textContent = d.btnChangeImage;
    }

    const srLoadText = document.getElementById("srLoadImageText");
    if (srLoadText && !srImg) {
      srLoadText.textContent = d.btnLoadImage;
    } else if (srLoadText && srImg) {
      srLoadText.textContent = d.btnChangeImage;
    }

    document.documentElement.lang = lang;
  }

  const langRadios = document.querySelectorAll('input[name="lang"]');
  langRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => applyLang(e.target.value));
  });

  const savedLang = localStorage.getItem("lang");
  const initialLang = savedLang === "en" || savedLang === "ja" ? savedLang : "ja";
  const targetRadio = document.querySelector(`input[name="lang"][value="${initialLang}"]`);
  if (targetRadio) targetRadio.checked = true;

  /* =========================================================
     タブ切り替え（原神 / 崩壊：スターレイル）
  ========================================================= */
  document.querySelectorAll(".main-mode-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".main-mode-tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      const mode = btn.dataset.mode;
      document.getElementById("genshin-panel").style.display = mode === "genshin" ? "" : "none";
      document.getElementById("starrail-panel").style.display = mode === "starrail" ? "" : "none";
    });
  });

  /* =========================================================
     入力パネルの折りたたみ
  ========================================================= */
  const inputPanel = document.getElementById("inputPanel");
  const inputPanelToggle = document.getElementById("inputPanelToggle");
  inputPanelToggle.addEventListener("click", () => {
    inputPanel.classList.toggle("collapsed");
  });

  const srInputPanel = document.getElementById("srInputPanel");
  const srInputPanelToggle = document.getElementById("srInputPanelToggle");
  srInputPanelToggle.addEventListener("click", () => {
    srInputPanel.classList.toggle("collapsed");
  });

  /* =========================================================
     会話ボックス描画
  ========================================================= */
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const canvasDropArea = document.getElementById("canvasDropArea");
  const imageInput = document.getElementById("imageInput");
  const nameInput = document.getElementById("nameInput");
  const subtitleInput = document.getElementById("subtitleInput");
  const bodyInput = document.getElementById("bodyInput");
  const uidInput = document.getElementById("uidInput");
  const downloadBtn = document.getElementById("downloadBtn");

  const FONT = '"Genshin", sans-serif';

  // Reference metrics, re-measured directly from the reference screenshot
  // (pixel-scanned against a reference box width of 1906px).
  const REF_W = 1906;
  const NAME_Y = 61;
  const SUBTITLE_Y = 96;
  const BODY_START_Y = 136;
  const BODY_LINE_HEIGHT = 38;
  const BODY_MIN_LINES = 2;
  const BOTTOM_PAD = 103;
  // Shifts the whole box (background, name, subtitle, body — not the
  // bottom-anchored diamond/UID) down by ~0.8 of a character's height,
  // requested to better match the reference's vertical placement.
  const GLOBAL_Y_OFFSET = 24;
  const BG_OFFSET_Y = 20;
  const BG_PEAK_Y = 10;
  const BG_UP_REACH = 10;
  const BG_DOWN_REACH = 280;
  const BG_EDGE_ALPHA = 0;
  const BG_CENTER_ALPHA = 0.44;
  const BG_HORIZ_REACH_RATIO = 0.52;
  const DIAMOND_FROM_BOTTOM = 34;
  const UID_FROM_BOTTOM = 3;
  const LEFT_MARGIN = 418;
  const RIGHT_MARGIN = 306;
  const UID_RIGHT_MARGIN = 26;
  const DECOR_SIDE_WIDTH = 455;
  const DECOR_LINE_OPACITY = 0.8;
  const DECOR_SIDE_GAP = 14;
  const DECOR_DIAMOND_SIZE = 24;

  const GOLD = "#f0c25a";
  const ORANGE = "#e9a44f";
  const WHITE = "#f6f2ee";

  let img = null;

  /* =========================================================
     崩壊：スターレイル — 会話ボックス描画
     原神側と完全に独立した状態・定数・関数を使う(原神の挙動に影響させないため)。
  ========================================================= */
  const srCanvas = document.getElementById("srCanvas");
  const srCtx = srCanvas.getContext("2d");
  const srCanvasDropArea = document.getElementById("srCanvasDropArea");
  const srImageInput = document.getElementById("srImageInput");
  const srNameInput = document.getElementById("srNameInput");
  const srBodyInput = document.getElementById("srBodyInput");
  const srUidInput = document.getElementById("srUidInput");
  const srDownloadBtn = document.getElementById("srDownloadBtn");

  const FONT_SR = '"Starrail", sans-serif';

  // Reference metrics, pixel-scanned from スタレ一部.png (reference width 1908).
  const REF_W_SR = 1908;
  const NAME_Y_SR = 38;
  const LINE_Y_SR = 55;
  const BODY_START_Y_SR = 89;
  const BODY_LINE_HEIGHT_SR = 34;
  const BODY_MIN_LINES_SR = 2;
  const BOTTOM_PAD_SR = 194;
  const CHEVRON_FROM_BOTTOM_SR = 69;
  const UID_FROM_BOTTOM_SR = 19;
  const LEFT_MARGIN_SR = 261;
  const RIGHT_MARGIN_SR = 273;
  const UID_LEFT_MARGIN_SR = 36;
  const DECOR_LINE_WIDTH_SR = 1700;
  const CHEVRON_SIZE_SR = 24;
  const NAME_FONT_SR = 28;
  const BODY_FONT_SR = 24;
  const UID_FONT_SR = 16;

  const GOLD_SR = "#f0c56a";
  const WHITE_SR = "#f6f2ee";

  let srImg = null;

  const srDecorLineImg = new Image();
  const srDecorChevronImg = new Image();
  function onSrDecorLoaded() {
    renderSR();
  }
  srDecorLineImg.onload = onSrDecorLoaded;
  srDecorChevronImg.onload = onSrDecorLoaded;
  srDecorLineImg.src = "Image/Starrail_00.png";
  srDecorChevronImg.src = "Image/Starrail_01.png";

  function wrapBodySR(text, maxWidth) {
    const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
    const lines = [];
    paragraphs.forEach((para) => {
      if (para.length === 0) {
        lines.push("");
        return;
      }
      let current = "";
      for (const ch of para) {
        const test = current + ch;
        if (srCtx.measureText(test).width > maxWidth && current.length > 0) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current.length > 0) lines.push(current);
    });
    return (lines.length ? lines : [""]).slice(0, BODY_MIN_LINES_SR);
  }

  function drawDecorLineSR(cx, y, s) {
    if (!srDecorLineImg.complete || !srDecorLineImg.naturalWidth) return;
    const w = DECOR_LINE_WIDTH_SR * s;
    const h = (w / srDecorLineImg.naturalWidth) * srDecorLineImg.naturalHeight;
    srCtx.drawImage(srDecorLineImg, cx - w / 2, y - h / 2, w, h);
  }

  function drawDecorChevronSR(cx, cy, s) {
    if (!srDecorChevronImg.complete || !srDecorChevronImg.naturalWidth) return;
    const w = CHEVRON_SIZE_SR * s;
    const h = (w / srDecorChevronImg.naturalWidth) * srDecorChevronImg.naturalHeight;
    srCtx.drawImage(srDecorChevronImg, cx - w / 2, cy - h / 2, w, h);
  }

  function renderSR() {
    if (!srImg) return;
    const W = srCanvas.width;
    const H = srCanvas.height;
    const s = W / REF_W_SR;

    srCtx.clearRect(0, 0, W, H);
    srCtx.drawImage(srImg, 0, 0, W, H);

    const name = srNameInput.value.trim();
    const bodyRaw = srBodyInput.value;
    const uid = srUidInput.value.trim();

    srCtx.font = `${Math.round(BODY_FONT_SR * s)}px ${FONT_SR}`;
    const maxTextWidth = W - (LEFT_MARGIN_SR + RIGHT_MARGIN_SR) * s;
    const lines = bodyRaw.trim() ? wrapBodySR(bodyRaw.trim(), maxTextWidth) : [];

    // Same fixed-box idea as Genshin: boxTop is always the BODY_MIN_LINES_SR
    // reference height, so name/line/body never move based on line count.
    const boxHeight = (BODY_START_Y_SR + (BODY_MIN_LINES_SR - 1) * BODY_LINE_HEIGHT_SR + BOTTOM_PAD_SR) * s;
    const boxTop = H - boxHeight;

    const cx = W / 2;

    srCtx.shadowColor = "rgba(0,0,0,0.6)";
    srCtx.shadowBlur = 5 * s;
    srCtx.shadowOffsetY = 1 * s;

    if (name) {
      srCtx.textAlign = "center";
      srCtx.font = `${Math.round(NAME_FONT_SR * s)}px ${FONT_SR}`;
      srCtx.fillStyle = GOLD_SR;
      srCtx.fillText(name, cx, boxTop + NAME_Y_SR * s);

      drawDecorLineSR(cx, boxTop + LINE_Y_SR * s, s);
    }

    if (lines.length) {
      srCtx.textAlign = "left";
      srCtx.font = `${Math.round(BODY_FONT_SR * s)}px ${FONT_SR}`;
      srCtx.fillStyle = WHITE_SR;
      lines.forEach((line, i) => {
        const y = boxTop + (BODY_START_Y_SR + i * BODY_LINE_HEIGHT_SR) * s;
        srCtx.fillText(line, LEFT_MARGIN_SR * s, y);
      });
    }

    srCtx.shadowColor = "transparent";
    srCtx.shadowBlur = 0;
    srCtx.shadowOffsetY = 0;

    drawDecorChevronSR(cx, H - CHEVRON_FROM_BOTTOM_SR * s, s);

    if (uid) {
      srCtx.textAlign = "left";
      srCtx.font = `${Math.round(UID_FONT_SR * s)}px ${FONT_SR}`;
      srCtx.fillStyle = "rgba(255,255,255,0.85)";
      srCtx.fillText(`UID:${uid}`, UID_LEFT_MARGIN_SR * s, H - UID_FROM_BOTTOM_SR * s);
    }
  }

  function loadImageSR(src) {
    const image = new Image();
    image.onload = () => {
      srImg = image;
      srCanvas.width = image.naturalWidth;
      srCanvas.height = image.naturalHeight;
      srCanvasDropArea.classList.add("has-image");
      srDownloadBtn.disabled = false;
      const lang = document.querySelector('input[name="lang"]:checked')?.value || "ja";
      applyLang(lang);
      renderSR();
    };
    image.src = src;
  }

  function loadFileSR(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => loadImageSR(e.target.result);
    reader.readAsDataURL(file);
  }

  srImageInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) loadFileSR(e.target.files[0]);
  });

  srCanvasDropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    srCanvasDropArea.classList.add("drag");
  });
  srCanvasDropArea.addEventListener("dragleave", () => srCanvasDropArea.classList.remove("drag"));
  srCanvasDropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    srCanvasDropArea.classList.remove("drag");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFileSR(e.dataTransfer.files[0]);
  });

  [srNameInput, srBodyInput, srUidInput].forEach((el) => {
    el.addEventListener("input", renderSR);
  });

  srDownloadBtn.addEventListener("click", () => {
    if (!srImg) return;
    srCanvas.toBlob((blob) => {
      if (!blob) {
        alert("画像の書き出しに失敗しました。file:// で直接開いている場合は、ローカルサーバー経由、または公開後のページでお試しください。");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dialogue_sr_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  });

  const decorLineImg = new Image();
  const decorDiamondImg = new Image();
  let decorLoadCount = 0;
  function onDecorLoaded() {
    decorLoadCount++;
    render();
  }
  decorLineImg.onload = onDecorLoaded;
  decorDiamondImg.onload = onDecorLoaded;
  decorLineImg.src = "Image/Genshin_00.png";
  decorDiamondImg.src = "Image/Genshin_01.png";

  function fitCanvasToImage() {
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
  }

  function wrapBody(text, maxWidth) {
    const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
    const lines = [];
    paragraphs.forEach((para) => {
      if (para.length === 0) {
        lines.push("");
        return;
      }
      let current = "";
      for (const ch of para) {
        const test = current + ch;
        if (ctx.measureText(test).width > maxWidth && current.length > 0) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current.length > 0) lines.push(current);
    });
    // Capped at BODY_MIN_LINES: the box no longer grows for a 3rd+ line, so
    // anything past that would just draw past the reserved area.
    return (lines.length ? lines : [""]).slice(0, BODY_MIN_LINES);
  }

  function drawDecorLine(cx, y, s, gapHalfWidth) {
    // Genshin_00.png is a single ornament (diamond outward, flourish toward
    // its inner end). It flanks the subtitle text: the flourish end touches
    // the text's edge, and the mirrored copy on the other side does the same.
    if (!decorLineImg.complete || !decorLineImg.naturalWidth) return;
    const sideW = DECOR_SIDE_WIDTH * s;
    const h = (sideW / decorLineImg.naturalWidth) * decorLineImg.naturalHeight;
    const innerL = cx - gapHalfWidth;
    const innerR = cx + gapHalfWidth;

    ctx.save();
    ctx.globalAlpha = DECOR_LINE_OPACITY;
    ctx.drawImage(decorLineImg, innerL - sideW, y - h / 2, sideW, h);
    ctx.scale(-1, 1);
    ctx.drawImage(decorLineImg, -(innerR + sideW), y - h / 2, sideW, h);
    ctx.restore();
  }

  function drawDecorDiamond(cx, cy, s) {
    if (!decorDiamondImg.complete || !decorDiamondImg.naturalWidth) return;
    const w = DECOR_DIAMOND_SIZE * s;
    const h = (w / decorDiamondImg.naturalWidth) * decorDiamondImg.naturalHeight;
    ctx.drawImage(decorDiamondImg, cx - w / 2, cy - h / 2, w, h);
  }

  function render() {
    if (!img) return;
    const W = canvas.width;
    const H = canvas.height;
    const s = W / REF_W;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    const name = nameInput.value.trim();
    const subtitle = subtitleInput.value.trim();
    const bodyRaw = bodyInput.value;
    const uid = uidInput.value.trim();

    ctx.font = `${Math.round(30 * s)}px ${FONT}`;
    const maxTextWidth = W - (LEFT_MARGIN + RIGHT_MARGIN) * s;
    const lines = bodyRaw.trim() ? wrapBody(bodyRaw.trim(), maxTextWidth) : [];

    // Every element (name, subtitle, each body line, UID, the darkened
    // background) sits at a fixed reference offset from boxTop, and boxTop
    // itself is always the BODY_MIN_LINES-tall reference height — it never
    // moves based on how many body lines are actually present. Extra lines
    // beyond that just draw further down inside the same fixed box instead
    // of pushing boxTop (and everything anchored to it) upward.
    const boxHeight = (BODY_START_Y + (BODY_MIN_LINES - 1) * BODY_LINE_HEIGHT + BOTTOM_PAD) * s;
    const boxTop = H - boxHeight + GLOBAL_Y_OFFSET * s;

    const cx = W / 2;

    // Measured from the reference: darkest at a point near the top of the
    // box (roughly where the name sits), fading outward in every direction
    // — but NOT symmetrically. Above that point it fades out quickly (a
    // short blur into the clean scene); below it, it fades out slowly, so
    // subtitle/body/UID all still sit on a clearly darkened area.
    // BG_OFFSET_Y shifts the whole darkened background down independently
    // of the text block above, to tighten the gap between the name and the
    // top of the darkened area without moving the name/subtitle/body text.
    // boxTop (and so boxHeight) is already constant across 0/1/2 body lines
    // thanks to BODY_MIN_LINES, so the background stays just as constant —
    // always the height of the 2-line case — regardless of line count.
    //
    // This is evaluated as one continuous elliptical-distance formula per
    // pixel (not two gradients drawn separately and abutted) — two separate
    // fillRect/clip() passes leave a visible seam where they meet because
    // their anti-aliased edges don't line up pixel-for-pixel.
    const bgTop = boxTop + BG_OFFSET_Y * s;
    const peakY = bgTop + BG_PEAK_Y * s;
    const horizReach = W * BG_HORIZ_REACH_RATIO;
    const upReach = BG_UP_REACH * s;
    const downReach = BG_DOWN_REACH * s;

    const rowTop = Math.max(0, Math.floor(bgTop));
    if (rowTop < H) {
      const region = ctx.getImageData(0, rowTop, W, H - rowTop);
      const px = region.data;
      const dR = 5, dG = 6, dB = 10;
      for (let row = 0; row < region.height; row++) {
        const y = rowTop + row;
        const dy = y - peakY;
        const vReach = dy <= 0 ? upReach : downReach;
        const vT = vReach > 0 ? dy / vReach : dy <= 0 ? -Infinity : Infinity;
        for (let x = 0; x < W; x++) {
          const hT = (x - cx) / horizReach;
          const t = Math.min(Math.sqrt(vT * vT + hT * hT), 1);
          const alpha = BG_CENTER_ALPHA + (BG_EDGE_ALPHA - BG_CENTER_ALPHA) * t;
          const i = (row * W + x) * 4;
          px[i] = dR * alpha + px[i] * (1 - alpha);
          px[i + 1] = dG * alpha + px[i + 1] * (1 - alpha);
          px[i + 2] = dB * alpha + px[i + 2] * (1 - alpha);
        }
      }
      ctx.putImageData(region, 0, rowTop);
    }
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 6 * s;
    ctx.shadowOffsetY = 1 * s;

    if (name) {
      ctx.font = `${Math.round(34 * s)}px ${FONT}`;
      ctx.fillStyle = GOLD;
      ctx.fillText(name, cx, boxTop + NAME_Y * s);
    }

    if (subtitle) {
      ctx.font = `${Math.round(22 * s)}px ${FONT}`;
      const subtitleHalfWidth = ctx.measureText(subtitle).width / 2;
      const decorY = boxTop + (SUBTITLE_Y - 7) * s;
      drawDecorLine(cx, decorY, s, subtitleHalfWidth + DECOR_SIDE_GAP * s);

      ctx.fillStyle = ORANGE;
      ctx.fillText(subtitle, cx, boxTop + SUBTITLE_Y * s);
    }

    if (lines.length) {
      ctx.textAlign = "center";
      ctx.font = `${Math.round(30 * s)}px ${FONT}`;
      ctx.fillStyle = WHITE;
      lines.forEach((line, i) => {
        const y = boxTop + (BODY_START_Y + i * BODY_LINE_HEIGHT) * s;
        ctx.fillText(line, cx, y);
      });
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    drawDecorDiamond(cx, H - DIAMOND_FROM_BOTTOM * s, s);

    if (uid) {
      ctx.textAlign = "right";
      ctx.font = `${Math.round(19 * s)}px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(`UID: ${uid}`, W - UID_RIGHT_MARGIN * s, H - UID_FROM_BOTTOM * s);
    }
  }

  function loadImage(src) {
    const image = new Image();
    image.onload = () => {
      img = image;
      fitCanvasToImage();
      canvasDropArea.classList.add("has-image");
      downloadBtn.disabled = false;
      const lang = document.querySelector('input[name="lang"]:checked')?.value || "ja";
      applyLang(lang);
      render();
    };
    image.src = src;
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => loadImage(e.target.result);
    reader.readAsDataURL(file);
  }

  imageInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
  });

  /* =========================================================
     画像拡大表示
     canvas要素自体をモーダルへ移動して拡大表示する(toDataURL/toBlobは
     file://で開いた際にローカル画像描画でcanvasがtaintedになり失敗するため使わない)
  ========================================================= */
  const imageModal = document.getElementById("imageModal");
  let modalCanvas = null;
  let modalHomeArea = null;

  // Shared by both games: opens whichever canvas/drop-area called it, and
  // remembers where to return it to on close — a single modal element is
  // reused, but only one canvas is ever inside it at a time.
  function openModalWith(canvasEl, homeArea, hasImage) {
    if (!hasImage) return;
    modalCanvas = canvasEl;
    modalHomeArea = homeArea;
    imageModal.appendChild(canvasEl);
    imageModal.classList.add("open");
  }

  function closeModal() {
    if (!imageModal.classList.contains("open")) return;
    imageModal.classList.remove("open");
    if (modalCanvas && modalHomeArea) {
      modalHomeArea.insertBefore(modalCanvas, modalHomeArea.firstChild);
    }
    modalCanvas = null;
    modalHomeArea = null;
  }

  canvasDropArea.addEventListener("click", () => openModalWith(canvas, canvasDropArea, !!img));
  srCanvasDropArea.addEventListener("click", () => openModalWith(srCanvas, srCanvasDropArea, !!srImg));
  imageModal.addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  canvasDropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    canvasDropArea.classList.add("drag");
  });
  canvasDropArea.addEventListener("dragleave", () => canvasDropArea.classList.remove("drag"));
  canvasDropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    canvasDropArea.classList.remove("drag");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  [nameInput, subtitleInput, bodyInput, uidInput].forEach((el) => {
    el.addEventListener("input", render);
  });

  downloadBtn.addEventListener("click", () => {
    if (!img) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        alert("画像の書き出しに失敗しました。file:// で直接開いている場合は、ローカルサーバー経由、または公開後のページでお試しください。");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dialogue_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  });

  /* =========================================================
     初期化
  ========================================================= */
  applyLang(initialLang);

  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load(`34px ${FONT}`),
      document.fonts.load(`22px ${FONT}`),
      document.fonts.load(`30px ${FONT}`),
      document.fonts.load(`19px ${FONT}`),
    ]).then(render);
    Promise.all([
      document.fonts.load(`${NAME_FONT_SR}px ${FONT_SR}`),
      document.fonts.load(`${BODY_FONT_SR}px ${FONT_SR}`),
      document.fonts.load(`${UID_FONT_SR}px ${FONT_SR}`),
    ]).then(renderSR);
  }
})();

(() => {
  "use strict";

  // Bump this on every push. Set from JS (not static HTML) so a stale
  // cached script.js shows its OLD number even if index.html is fresh —
  // makes browser-cache mismatches obvious instead of silently hiding them.
  const BUILD_VERSION = "v7";
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
    return lines.length ? lines : [""];
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

    // The body area always reserves at least BODY_MIN_LINES of height; when
    // there's less text than that, it's bottom-packed (empty slot(s) stay at
    // the top), and the name/subtitle block shifts down by the same amount
    // so it stays snug against the text instead of leaving a gap.
    const linesForHeight = Math.max(lines.length, BODY_MIN_LINES);
    const emptySlots = linesForHeight - lines.length;
    const shiftDown = emptySlots * BODY_LINE_HEIGHT;

    const boxHeight = (BODY_START_Y + (linesForHeight - 1) * BODY_LINE_HEIGHT + BOTTOM_PAD) * s;
    const boxTop = H - boxHeight;

    const cx = W / 2;

    // Measured from the reference: darkest at a point near the top of the
    // box (roughly where the name sits), fading outward in every direction
    // — but NOT symmetrically. Above that point it fades out quickly (a
    // short blur into the clean scene); below it, it fades out slowly, so
    // subtitle/body/UID all still sit on a clearly darkened area.
    // BG_OFFSET_Y shifts the whole darkened background down independently
    // of the text block above, to tighten the gap between the name and the
    // top of the darkened area without moving the name/subtitle/body text.
    // Deliberately NOT shifted by shiftDown: boxTop (and so boxHeight) is
    // already constant across 0/1/2 body lines thanks to BODY_MIN_LINES, and
    // the background should stay just as constant — always the height of
    // the 2-line case — rather than growing/shrinking with the line count.
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
      ctx.fillText(name, cx, boxTop + (NAME_Y + shiftDown) * s);
    }

    if (subtitle) {
      ctx.font = `${Math.round(22 * s)}px ${FONT}`;
      const subtitleHalfWidth = ctx.measureText(subtitle).width / 2;
      const decorY = boxTop + (SUBTITLE_Y - 7 + shiftDown) * s;
      drawDecorLine(cx, decorY, s, subtitleHalfWidth + DECOR_SIDE_GAP * s);

      ctx.fillStyle = ORANGE;
      ctx.fillText(subtitle, cx, boxTop + (SUBTITLE_Y + shiftDown) * s);
    }

    if (lines.length) {
      ctx.textAlign = "center";
      ctx.font = `${Math.round(30 * s)}px ${FONT}`;
      ctx.fillStyle = WHITE;
      lines.forEach((line, i) => {
        const y = boxTop + (BODY_START_Y + shiftDown + i * BODY_LINE_HEIGHT) * s;
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

  function openModal() {
    if (!img) return;
    imageModal.appendChild(canvas);
    imageModal.classList.add("open");
  }

  function closeModal() {
    if (!imageModal.classList.contains("open")) return;
    imageModal.classList.remove("open");
    canvasDropArea.insertBefore(canvas, canvasDropArea.firstChild);
  }

  canvasDropArea.addEventListener("click", openModal);
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
  }
})();

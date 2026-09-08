// saved-image-init.js
// script.js が type="module" ではないため import が使えない。
// このファイルだけ type="module" にして、アカウント登録者向けクラウド保存
// (24_AccountCenter/saved-image.js)を担当する。script.js側は画像のBlobが
// 手に入った時点で document に "uko-image-saved" イベント(detail:{blob, siteId})
// を投げるだけでよい。
//
// このサイトは原神/スタレ/魔女会の3種類の画像を別々に作れるので、
// 「前回保存した画像」もそれぞれ別枠(別SITE_ID)で持たせている。
//
// firebaseConfig.js を先に評価してデフォルトAppを確立してから saved-image.js を
// importすること(順序が逆だとログイン状態が正しく共有されない。saved-image.js
// のコメント参照)。
import { db } from './firebaseConfig.js';
import { doc, runTransaction, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  onAccountAuthState, saveProfileImage, getSavedProfileImage, formatSavedAt,
} from 'https://uko05.github.io/24_AccountCenter/saved-image.js';

const WIDGETS = [
  { idSuffix: 'genshin', siteId: 'playMakerGenshin' },
  { idSuffix: 'starrail', siteId: 'playMakerStarrail' },
  { idSuffix: 'majokai', siteId: 'playMakerMajokai' },
];

// ===== ユーザーID(uko05.github.io配下の全サイト共通のlocalStorageキー) =====
const LS_USER_ID = 'genshinOmikuji_userId';
function getSharedUserId() {
  let id = localStorage.getItem(LS_USER_ID);
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = 'u_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(LS_USER_ID, id);
  }
  return id;
}

// ===== 「画像を1回生成する」ミッション(アカウント登録者限定・生涯1回・+20UP)
// 3種類(原神/スタレ/魔女会)のうちどれか1つを生成すれば達成(claimKeyは共通1個)。 =====
const MISSION_CLAIM_KEY = 'playMakerImage';
let missionLoggedInUser = null;
onAccountAuthState((user) => {
  missionLoggedInUser = user;
  if (user) claimImageGenerationMissionIfAlreadySaved();
});

function showMissionToast(text) {
  let toast = document.getElementById('uko-mission-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'uko-mission-toast';
    toast.className = 'uko-mission-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.remove('show');
  void toast.offsetWidth; // reflow
  toast.classList.add('show');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

async function claimMissionOnce() {
  const userId = getSharedUserId();
  const ref = doc(db, 'omikujiUsers', userId);
  try {
    const claimed = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? snap.data() : {};
      if (data.missionsClaimed?.[MISSION_CLAIM_KEY]) return false;
      tx.set(ref, {
        ukoPoints: increment(20),
        missionsClaimed: { [MISSION_CLAIM_KEY]: true },
      }, { merge: true });
      return true;
    });
    if (claimed) {
      const lang = savedImageLang();
      showMissionToast(lang === 'en' ? 'Mission complete! +20 UP' : 'ミッション達成！ +20UP');
    }
  } catch (e) {
    console.error('[mission] claim failed', e);
  }
}

// 画像生成が成功した時に呼ぶ。未ログインなら静かに何もしない。
function claimImageGenerationMission() {
  if (!missionLoggedInUser) return;
  claimMissionOnce();
}

// 既にログイン前から(3種類のどれかを)画像を保存済みだった人を、ログイン検知時に遡って達成扱いにする
async function claimImageGenerationMissionIfAlreadySaved() {
  for (const { siteId } of WIDGETS) {
    try {
      const entry = await getSavedProfileImage(siteId);
      if (entry) { await claimMissionOnce(); return; }
    } catch (e) {
      console.error('[mission] backfill check failed', e);
    }
  }
}

function savedImageLang() {
  return document.querySelector('input[name="lang"]:checked')?.value || localStorage.getItem('lang') || 'ja';
}

const SAVED_IMAGE_NOT_LOGGED_IN_HTML = {
  ja: 'アカウント登録すると、ここで前回保存した画像を確認できます。<a href="https://uko05.github.io/24_AccountCenter/" target="_blank" rel="noopener">登録はこちら（任意）</a>',
  en: 'Register an account to see your last saved image here. <a href="https://uko05.github.io/24_AccountCenter/" target="_blank" rel="noopener">Register here (optional)</a>',
};
const SAVED_IMAGE_NO_HISTORY_HTML = {
  ja: '画像を保存すると、ここに表示されます。',
  en: 'Once you save an image, it will appear here.',
};

const modal = document.getElementById('uko-saved-image-modal');
const modalImg = document.getElementById('uko-saved-image-modal-img');
const modalClose = document.getElementById('uko-saved-image-modal-close');
modalClose?.addEventListener('click', () => { modal.style.display = 'none'; });
modal?.querySelector('.uko-saved-image-modal-backdrop')?.addEventListener('click', () => { modal.style.display = 'none'; });

const refreshFns = {};

// 「前回保存した画像を確認」トグルの初期化(id接尾辞ごとに1個ずつ)。
// 未登録者にも常に表示し(登録を後押しするため)、状態に応じてメッセージ/画像を切り替える。
function createSavedImageWidget({ idSuffix, siteId }) {
  const toggle = document.getElementById(`uko-saved-image-toggle-${idSuffix}`);
  const panel = document.getElementById(`uko-saved-image-panel-${idSuffix}`);
  const messageEl = document.getElementById(`uko-saved-image-message-${idSuffix}`);
  const dateEl = document.getElementById(`uko-saved-image-date-${idSuffix}`);
  const imgEl = document.getElementById(`uko-saved-image-img-${idSuffix}`);
  const arrowEl = document.getElementById(`uko-saved-image-arrow-${idSuffix}`);
  if (!toggle || !panel || !messageEl || !dateEl || !imgEl) return;

  toggle.addEventListener('click', () => {
    const willOpen = panel.style.display === 'none';
    panel.style.display = willOpen ? 'block' : 'none';
    if (arrowEl) arrowEl.textContent = willOpen ? '▲' : '▼';
  });

  // サムネイルは元画像の30%サイズで表示する
  imgEl.addEventListener('load', () => {
    imgEl.style.width = `${imgEl.naturalWidth * 0.3}px`;
  });
  // クリックで原寸(100%)ポップアップ表示(モーダルは全ウィジェット共通)
  imgEl.addEventListener('click', () => {
    if (!modal || !modalImg) return;
    modalImg.src = imgEl.src;
    modal.style.display = 'flex';
  });

  let loggedIn = false;

  function showMessage(html) {
    messageEl.innerHTML = html;
    messageEl.style.display = 'block';
    dateEl.style.display = 'none';
    imgEl.style.display = 'none';
  }

  async function refresh() {
    if (!loggedIn) {
      showMessage(SAVED_IMAGE_NOT_LOGGED_IN_HTML[savedImageLang()]);
      return;
    }
    const entry = await getSavedProfileImage(siteId);
    if (entry) {
      messageEl.style.display = 'none';
      dateEl.style.display = 'block';
      imgEl.style.display = 'block';
      dateEl.textContent = formatSavedAt(entry.updatedAt);
      imgEl.src = entry.url;
    } else {
      showMessage(SAVED_IMAGE_NO_HISTORY_HTML[savedImageLang()]);
    }
  }
  refreshFns[siteId] = refresh;
  onAccountAuthState((user) => { loggedIn = !!user; refresh(); });
  document.querySelectorAll('input[name="lang"]').forEach((el) => el.addEventListener('change', refresh));
}

document.addEventListener('uko-image-saved', (e) => {
  const { blob, siteId } = e.detail;
  saveProfileImage(siteId, blob).then(() => refreshFns[siteId]?.());
  claimImageGenerationMission();
});

document.addEventListener('DOMContentLoaded', () => {
  WIDGETS.forEach(createSavedImageWidget);
});

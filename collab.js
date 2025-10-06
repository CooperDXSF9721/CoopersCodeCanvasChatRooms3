// ==================== Firebase Config ====================
const firebaseConfig = {
  apiKey: "AIzaSyBUfT7u7tthl3Nm-ePsY7XWrdLK7YNoLVQ",
  authDomain: "cooperscodeart.firebaseapp.com",
  projectId: "cooperscodeart",
  storageBucket: "cooperscodeart.firebasestorage.app",
  messagingSenderId: "632469567217",
  appId: "1:632469567217:web:14278c59ad762e67eedb50",
  measurementId: "G-NXS0EPJR61"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==================== Room Management ====================
let currentRoomId = null;
let currentPageId = 'page1'; // Default page
let linesRef = null;
let textsRef = null;
let roomDeletedRef = null;
let roomClearedRef = null;
let isJoiningRoom = false;

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function joinRoom(roomId, password = null) {
  // Check if room has password protection (skip for public)
  if (roomId !== 'public') {
    const roomRef = db.ref(`rooms/${roomId}`);
    const roomSnapshot = await roomRef.once('value');
    
    const roomData = roomSnapshot.val();
    
    if (!roomData || roomData.deleted === true) {
      alert('Room does not exist');
      joinRoom('public');
      return;
    }
    
    const hasLines = roomData && roomData.lines;
    const hasTexts = roomData && roomData.texts;
    const hasPassword = roomData && roomData.password;
    
    const roomExists = hasPassword || hasLines || hasTexts;
    
    if (!roomExists && roomData === null) {
      alert('Room does not exist');
      joinRoom('public');
      return;
    }
    
    const passwordRef = db.ref(`rooms/${roomId}/password`);
    const passwordSnapshot = await passwordRef.once('value');
    const storedPassword = passwordSnapshot.val();

    if (storedPassword) {
      if (password === null) {
        const inputPassword = prompt('This room is password protected. Enter the passkey:');
        if (!inputPassword) {
          joinRoom('public');
          return;
        }
        password = inputPassword;
      }

      if (password !== storedPassword) {
        alert('Incorrect Passkey');
        joinRoom('public');
        return;
      }
    }
  }

  if (linesRef) linesRef.off();
  if (textsRef) textsRef.off();
  if (roomDeletedRef) roomDeletedRef.off();
  if (roomClearedRef) roomClearedRef.off();

  currentRoomId = roomId;
  
  // For public room, use old structure without pages
  if (roomId === 'public') {
    linesRef = db.ref(`rooms/${roomId}/lines`);
    textsRef = db.ref(`rooms/${roomId}/texts`);
  } else {
    // For private rooms, use page structure
    currentPageId = 'page1';
    
    // Ensure page1 exists
    const page1Ref = db.ref(`rooms/${roomId}/pages/page1`);
    const page1Snapshot = await page1Ref.once('value');
    if (!page1Snapshot.exists()) {
      await db.ref(`rooms/${roomId}/pages/page1/name`).set('Page 1');
      await db.ref(`rooms/${roomId}/pages/page1/created`).set(true);
    }
    
    linesRef = db.ref(`rooms/${roomId}/pages/${currentPageId}/lines`);
    textsRef = db.ref(`rooms/${roomId}/pages/${currentPageId}/texts`);
  }

  isJoiningRoom = true;
  linesCache.length = 0;
  textsCache.clear();
  drawAll();

  setupFirebaseListeners();
  setupRoomDeletionListener();
  setupRoomClearedListener();
  updateRoomIndicator();
  if (roomId !== 'public') {
    updatePageIndicator();
  }

  window.location.hash = roomId;
  
  // Reset the flag after listeners are set up
  setTimeout(() => { isJoiningRoom = false; }, 1000);
}

function setupRoomDeletionListener() {
  if (currentRoomId === 'public') return;
  
  roomDeletedRef = db.ref(`rooms/${currentRoomId}/deleted`);
  roomDeletedRef.on('value', snapshot => {
    if (snapshot.val() === true) {
      alert('Sorry, this room has been deleted by the owner.');
      joinRoom('public');
    }
  });
}

function setupRoomClearedListener() {
  if (currentRoomId === 'public') {
    roomClearedRef = db.ref(`rooms/${currentRoomId}/cleared`);
  } else {
    roomClearedRef = db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/cleared`);
  }
  
  roomClearedRef.on('value', snapshot => {
    if (!isJoiningRoom && snapshot.exists()) {
      // Canvas was cleared
      linesCache.length = 0;
      textsCache.clear();
      drawAll();
    }
  });
}

function updatePageIndicator() {
  const indicator = document.getElementById('pageIndicator');
  if (indicator && currentRoomId) {
    // Get the page name from Firebase
    db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/name`).once('value', snapshot => {
      const pageName = snapshot.val();
      if (pageName) {
        indicator.textContent = pageName;
      } else {
        const pageNum = currentPageId.replace('page', '');
        indicator.textContent = `Page ${pageNum}`;
      }
    });
  }
}

async function switchPage(pageId) {
  if (pageId === currentPageId) return;
  
  // Turn off old listeners
  if (linesRef) linesRef.off();
  if (textsRef) textsRef.off();
  if (roomClearedRef) roomClearedRef.off();
  
  currentPageId = pageId;
  linesRef = db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/lines`);
  textsRef = db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/texts`);
  
  isJoiningRoom = true;
  linesCache.length = 0;
  textsCache.clear();
  drawAll();
  
  setupFirebaseListeners();
  setupRoomClearedListener();
  updatePageIndicator();
  
  setTimeout(() => { isJoiningRoom = false; }, 1000);
}

function updateRoomIndicator() {
  const indicator = document.getElementById('roomIndicator');
  const menuBtn = document.getElementById('roomMenuBtn');
  const roomCodeDisplay = document.getElementById('roomCodeDisplay');
  const deleteBtn = document.getElementById('deleteRoomBtn');
  const copyBtn = document.getElementById('copyRoomBtn');
  const pageMenuContainer = document.querySelector('.page-menu-container');

  if (indicator && currentRoomId) {
    if (currentRoomId === 'public') {
      indicator.textContent = 'Public Canvas';
      menuBtn?.classList.add('public');
      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = 'You are on the public canvas';
        roomCodeDisplay.style.fontFamily = 'Inter, system-ui, sans-serif';
      }
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (copyBtn) copyBtn.style.display = 'none';
      if (pageMenuContainer) pageMenuContainer.style.display = 'none';
    } else {
      indicator.textContent = currentRoomId;
      menuBtn?.classList.remove('public');
      if (roomCodeDisplay) {
        roomCodeDisplay.textContent = currentRoomId;
        roomCodeDisplay.style.fontFamily = "'JetBrains Mono', 'Courier New', monospace";
      }
      if (deleteBtn) deleteBtn.style.display = 'block';
      if (copyBtn) copyBtn.style.display = 'block';
      if (pageMenuContainer) pageMenuContainer.style.display = 'block';
    }
  }
}

function setupFirebaseListeners() {
  // Store line keys to track them
  const lineKeys = new Map(); // maps Firebase key to cache index
  
  linesRef.on('child_added', snapshot => {
    const line = snapshot.val();
    const key = snapshot.key;
    const index = linesCache.length;
    linesCache.push(line);
    lineKeys.set(key, index);
    
    line.points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, line.width / 2, 0, Math.PI * 2);
      if (line.erase) { 
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.fillStyle = 'rgba(0,0,0,1)'; 
      } else { 
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.fillStyle = line.color; 
      }
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  });

  // Listen for when the entire lines node is removed (cleared)
  linesRef.on('value', snapshot => {
    if (!isJoiningRoom && !snapshot.exists() && linesCache.length > 0) {
      // Lines were cleared by someone else
      linesCache.length = 0;
      lineKeys.clear();
      drawAll();
    }
  });

  textsRef.on('child_added', snapshot => {
    const key = snapshot.key;
    const val = snapshot.val();
    textsCache.set(key, val);
    drawAll();
  });

  textsRef.on('child_changed', snapshot => {
    const key = snapshot.key;
    const val = snapshot.val();
    textsCache.set(key, val);
    drawAll();
  });

  textsRef.on('child_removed', snapshot => {
    const key = snapshot.key;
    textsCache.delete(key);
    drawAll();
  });

  // Listen for when the entire texts node is removed (cleared)
  textsRef.on('value', snapshot => {
    if (!isJoiningRoom && !snapshot.exists() && textsCache.size > 0) {
      // Texts were cleared by someone else
      textsCache.clear();
      drawAll();
    }
  });
}

// ==================== Canvas Setup ====================
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const linesCache = [];
const textsCache = new Map();

function drawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  linesCache.forEach(line => {
    const { points, color, width, erase } = line;
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, width/2, 0, Math.PI*2);
      if (erase) { 
        ctx.globalCompositeOperation = 'destination-out'; 
        ctx.fillStyle = 'rgba(0,0,0,1)'; 
      } else { 
        ctx.globalCompositeOperation = 'source-over'; 
        ctx.fillStyle = color; 
      }
      ctx.fill();
    });
  });
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'top';
  textsCache.forEach(obj => {
    const size = obj.size || 40;
    const color = obj.color || '#000';
    const font = obj.font || 'sans-serif';
    const content = obj.text || '';
    if (!content) return;
    ctx.font = `${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(content, obj.x, obj.y);
  });
}

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawAll();
});

// ==================== Drawing State ====================
let brushColor = "#000000";
let brushSize = 4;
let drawing = false;
let current = { x: 0, y: 0 };
let eraserActive = false;

function drawLineSmooth(x0, y0, x1, y1, color = brushColor, width = brushSize, erase = false) {
  const points = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const distance = Math.sqrt(dx*dx + dy*dy);
  const steps = Math.ceil(distance / 2);

  for (let i = 0; i <= steps; i++) {
    const xi = x0 + (dx * i) / steps;
    const yi = y0 + (dy * i) / steps;
    points.push({ x: xi, y: yi });
    ctx.beginPath();
    ctx.arc(xi, yi, width / 2, 0, Math.PI * 2);
    if (erase) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
    }
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  return points;
}

// ==================== Pointer Handling & Text Dragging ====================
function startDrawing(x, y) { drawing = true; current.x = x; current.y = y; }
function stopDrawing() { drawing = false; }

function textAtPoint(x, y) {
  let found = null;
  textsCache.forEach((t, key) => {
    const size = t.size || 40;
    const font = t.font || 'sans-serif';
    const content = t.text || '';
    if (!content) return;
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = 'top';
    const w = ctx.measureText(content).width;
    const h = size;
    if (x >= t.x && x <= t.x + w && y >= t.y && y <= t.y + h) {
      found = { key, t };
    }
  });
  return found;
}

let draggingTextKey = null;
let dragOffset = { x: 0, y: 0 };
let dragRAFQueued = false;
let latestDragPos = null;

function scheduleDragUpdate() {
  if (dragRAFQueued) return;
  dragRAFQueued = true;
  requestAnimationFrame(() => {
    dragRAFQueued = false;
    if (!draggingTextKey || !latestDragPos) return;
    const { x, y } = latestDragPos;
    const local = textsCache.get(draggingTextKey);
    if (local) { local.x = x; local.y = y; }
    drawAll();
    textsRef.child(draggingTextKey).update({ x, y });
  });
}

function handlePointerDown(x, y) {
  const hit = textAtPoint(x, y);
  if (hit) {
    draggingTextKey = hit.key;
    dragOffset.x = x - hit.t.x;
    dragOffset.y = y - hit.t.y;
    return;
  }
  startDrawing(x, y);
}

function drawMove(x, y) {
  if (draggingTextKey) {
    latestDragPos = { x: x - dragOffset.x, y: y - dragOffset.y };
    scheduleDragUpdate();
    return;
  }
  if (!drawing) return;
  const points = drawLineSmooth(current.x, current.y, x, y, brushColor, brushSize, eraserActive);
  if (eraserActive && points && points.length) {
    const removed = new Set();
    points.forEach(p => {
      const hit = textAtPoint(p.x, p.y);
      if (hit && !removed.has(hit.key)) {
        removed.add(hit.key);
        textsRef.child(hit.key).remove();
      }
    });
  }
  linesRef.push({ points, color: brushColor, width: brushSize, erase: eraserActive });
  current.x = x;
  current.y = y;
}

function handlePointerUp() {
  drawing = false;
  draggingTextKey = null;
  latestDragPos = null;
  dragRAFQueued = false;
}

canvas.addEventListener('mousedown', e => handlePointerDown(e.clientX, e.clientY));
canvas.addEventListener('mouseup', () => handlePointerUp());
canvas.addEventListener('mouseout', () => handlePointerUp());
canvas.addEventListener('mousemove', e => drawMove(e.clientX, e.clientY));

canvas.addEventListener('touchstart', e => { 
  e.preventDefault(); 
  const t = e.touches[0]; 
  handlePointerDown(t.clientX, t.clientY); 
});
canvas.addEventListener('touchend', e => { 
  e.preventDefault(); 
  handlePointerUp(); 
});
canvas.addEventListener('touchmove', e => { 
  e.preventDefault(); 
  const t = e.touches[0]; 
  drawMove(t.clientX, t.clientY); 
});

// ==================== UI Controls ====================
const colorPicker = document.getElementById('colorPicker');
const sizePicker = document.getElementById('sizePicker');
if (sizePicker) {
  sizePicker.max = '200';
  sizePicker.setAttribute('max', '200');
}
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');
const freeTextInput = document.getElementById('freeTextInput');

let textSizePicker = document.getElementById('textSizePicker');
let textFontPicker = document.getElementById('textFontPicker');
if (!textFontPicker) {
  const toolbarEl = document.getElementById('toolbar') || document.body;
  textFontPicker = document.createElement('select');
  textFontPicker.id = 'textFontPicker';
  textFontPicker.title = 'Text font';
  textFontPicker.style.padding = '8px 12px';
  textFontPicker.style.background = 'hsl(217, 20%, 20%)';
  textFontPicker.style.border = '1px solid hsl(217, 20%, 35%)';
  textFontPicker.style.borderRadius = '8px';
  textFontPicker.style.color = 'hsl(217, 10%, 92%)';
  textFontPicker.style.fontSize = '16px';
  textFontPicker.style.cursor = 'pointer';
  textFontPicker.style.minWidth = '140px';
  
  const fonts = [
    { name: 'Sans Serif', value: 'sans-serif' },
    { name: 'Serif', value: 'serif' },
    { name: 'Monospace', value: 'monospace' },
    { name: 'Arial', value: 'Arial, sans-serif' },
    { name: 'Times New Roman', value: '"Times New Roman", serif' },
    { name: 'Courier New', value: '"Courier New", monospace' },
    { name: 'Brush Script', value: '"Brush Script MT", cursive' }
  ];
  
  fonts.forEach(font => {
    const option = document.createElement('option');
    option.value = font.value;
    option.textContent = font.name;
    option.style.fontFamily = font.value;
    option.style.fontSize = '16px';
    textFontPicker.appendChild(option);
  });
  
  if (toolbarEl && freeTextInput && freeTextInput.parentElement === toolbarEl) {
    toolbarEl.insertBefore(textFontPicker, freeTextInput);
  } else if (toolbarEl) {
    toolbarEl.appendChild(textFontPicker);
  } else {
    document.body.appendChild(textFontPicker);
  }
}

const getTextSize = () => {
  const n = parseInt(textSizePicker.value, 10);
  if (Number.isNaN(n)) return 40;
  return Math.max(10, Math.min(200, n));
};

const getTextFont = () => {
  return textFontPicker.value || 'sans-serif';
};

colorPicker.addEventListener('change', e => {
  brushColor = e.target.value;
  eraserActive = false;
  eraserBtn.style.backgroundColor = '';
});

const updateBrushSize = (raw) => {
  const val = parseInt(raw, 10);
  if (!Number.isNaN(val)) {
    brushSize = Math.max(1, Math.min(200, val));
  }
};
sizePicker.addEventListener('input', e => updateBrushSize(e.target.value));
sizePicker.addEventListener('change', e => updateBrushSize(e.target.value));

eraserBtn.addEventListener('click', () => {
  eraserActive = !eraserActive;
  eraserBtn.style.backgroundColor = eraserActive ? 'orange' : '';
});

function findEmptySpace(textWidth, textHeight) {
  const padding = 20;
  const step = 50;
  const maxAttempts = 100;
  
  // Get toolbar dimensions to avoid placing text behind it
  const toolbar = document.getElementById('toolbar');
  const toolbarRect = toolbar ? toolbar.getBoundingClientRect() : null;
  const toolbarPadding = 20; // Extra space around toolbar
  
  // Helper function to check if position overlaps with toolbar
  function overlapsWithToolbar(x, y, w, h) {
    if (!toolbarRect) return false;
    
    // Check if text overlaps with toolbar area (with padding)
    return !(x > toolbarRect.right + toolbarPadding || 
             x + w < toolbarRect.left - toolbarPadding || 
             y > toolbarRect.bottom + toolbarPadding || 
             y + h < toolbarRect.top - toolbarPadding);
  }
  
  // Helper function to check if a rectangle overlaps with any existing text
  function overlapsWithText(x, y, w, h) {
    let hasOverlap = false;
    textsCache.forEach(t => {
      const tSize = t.size || 40;
      const tFont = t.font || 'sans-serif';
      const tContent = t.text || '';
      if (!tContent) return;
      
      ctx.font = `${tSize}px ${tFont}`;
      const tWidth = ctx.measureText(tContent).width;
      const tHeight = tSize;
      
      // Check if rectangles overlap
      if (!(x + w + padding < t.x || 
            x > t.x + tWidth + padding || 
            y + h + padding < t.y || 
            y > t.y + tHeight + padding)) {
        hasOverlap = true;
      }
    });
    return hasOverlap;
  }
  
  // Start from a grid pattern
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const gridX = (attempt % 10) * step + 50;
    const gridY = Math.floor(attempt / 10) * step + 50;
    
    // Make sure we stay within canvas bounds
    if (gridX + textWidth + padding > canvas.width || 
        gridY + textHeight + padding > canvas.height) {
      continue;
    }
    
    // Check if it overlaps with toolbar or existing text
    if (!overlapsWithToolbar(gridX, gridY, textWidth, textHeight) &&
        !overlapsWithText(gridX, gridY, textWidth, textHeight)) {
      return { x: gridX, y: gridY };
    }
  }
  
  // If no empty space found, place at random location (avoiding toolbar)
  let randomX, randomY;
  for (let i = 0; i < 20; i++) {
    randomX = Math.random() * (canvas.width - textWidth - 100) + 50;
    randomY = Math.random() * (canvas.height - textHeight - 100) + 50;
    
    if (!overlapsWithToolbar(randomX, randomY, textWidth, textHeight)) {
      return { x: randomX, y: randomY };
    }
  }
  
  // Last resort: place it in the middle-right area
  return {
    x: canvas.width - textWidth - 100,
    y: canvas.height / 2
  };
}

function containsProfanity(text) {
  // List of profane words to filter
  const profanityList = ["2 girls 1 cup", "2g1c", "4r5e", "5h1t", "5hit", "5ht", "@$$", "a s s", "a s shole", "a55", "a55hole", "a_s_s", "abbo", "abeed", "abuse", "acrotomophilia", "africoon", "ahole", "alabama hot pocket", "alaskan pipeline", "alligator bait", "alligatorbait", "amcik", "anal", "analannie", "analprobe", "analsex", "andskota", "anilingus", "anus", "apeshit", "ar5e", "arabush", "arabushs", "areola", "areole", "argie", "armo", "armos", "arrse", "arschloch", "arse", "arsehole", "aryan", "ash0le", "ash0les", "asholes", "ass monkey", "ass", "ass-fucker", "ass-hat", "ass-pirate", "assbag", "assbagger", "assbandit", "assbang", "assbanged", "assbanger", "assbangs", "assbite", "assblaster", "assclown", "asscock", "asscowboy", "asscracker", "asses", "assface", "assfuck", "assfucker", "assfukka", "assgoblin", "assh0le", "assh0lez", "asshat", "asshead", "assho1e", "asshole", "assholes", "assholz", "asshopper", "asshore", "assjacker", "assjockey", "asskiss", "asskisser", "assklown", "asslick", "asslicker", "asslover", "assman", "assmaster", "assmonkey", "assmunch", "assmuncher", "assnigger", "asspacker", "asspirate", "asspuppies", "assrammer", "assranger", "assshit", "assshole", "asssucker", "asswad", "asswhole", "asswhore", "asswipe", "asswipes", "auto erotic", "autoerotic", "ayir", "azazel", "azz", "azzhole", "b a s t a r d", "b i t c h", "b o o b", "b!+ch", "b!tch", "b!tchin", "b*tch", "b00b", "b00bies", "b00biez", "b00bs", "b00bz", "b17ch", "b1tch", "b7ch", "babeland", "babes", "baby batter", "baby juice", "backdoorman", "badfuck", "ball gag", "ball gravy", "ball kicking", "ball licking", "ball sack", "ball sucking", "ballbag", "balllicker", "ballsack", "bampot", "bangbro", "bangbros", "bangbus", "bareback", "barely legal", "barelylegal", "barenaked", "barface", "barfface", "bassterd", "bassterds", "bastard", "bastardo", "bastards", "bastardz", "basterds", "basterdz", "bastinado", "bazongas", "bazooms", "bbw", "bdsm", "beaner", "beaners", "beaney", "beaneys", "beardedclam", "beastality", "beastial", "beastiality", "beastility", "beatch", "beatoff", "beatyourmeat", "beaver cleaver", "beaver lips", "beef curtains", "beeyotch", "bellend", "beotch", "bestial", "bestiality", "bi curious", "bi+ch", "bi7ch", "biatch", "bicurious", "big black", "big breasts", "big knockers", "big tits", "bigass", "bigbastard", "bigbreasts", "bigbutt", "bigtits", "bimbo", "bimbos", "bint", "birdlock", "bitch", "bitchass", "bitched", "bitcher", "bitchers", "bitches", "bitchez", "bitchin", "bitching", "bitchslap", "bitchtit", "bitchy", "biteme", "bitties", "black cock", "blackcock", "blackman", "blacks", "blonde action", "blonde on blonde action", "blonde on blonde", "bloodclaat", "blow j", "blow job", "blow your l", "blow your load", "blowjob", "blowjobs", "blue waffle", "bluegum", "bluegums", "blumpkin", "bo ob", "bo obs", "boang", "boche", "boches", "boffing", "bogan", "bohunk", "boink", "boiolas", "bollick", "bollock", "bollocks", "bollok", "bollox", "bombers", "bomd", "bondage", "boned", "boner", "boners", "bong", "boong", "boonga", "boongas", "boongs", "boonie", "boonies", "booobs", "boooobs", "booooobs", "booooooobs", "bootee", "bootlip", "bootlips", "boozer", "bosch", "bosche", "bosches", "boschs", "bosomy", "bounty bar", "bounty bars", "bountybar", "brea5t", "breastjob", "breastlover", "breastman", "brown shower", "brown showers", "brunette action", "btch", "buceta", "buddhahead", "buddhaheads", "buffies", "bugger", "buggered", "buggery", "bukake", "bukkake", "bullcrap", "bulldike", "bulldyke", "bullet vibe", "bullshit", "bullshits", "bullshitted", "bullturds", "bumblefuck", "bumfuck", "bung hole", "bung", "bunga", "bungas", "bunghole", "bunny fucker", "burr head", "burr heads", "burrhead", "burrheads", "butchbabes", "butchdike", "butchdyke", "butt plug", "butt-pirate", "buttbang", "buttcheeks", "buttface", "buttfuck", "buttfucker", "buttfuckers", "butthead", "butthole", "buttman", "buttmuch", "buttmunch", "buttmuncher", "buttpirate", "buttplug", "buttstain", "buttwipe", "byatch", "c u n t", "c-0-c-k", "c-o-c-k", "c-u-n-t", "c.0.c.k", "c.o.c.k.", "c.u.n.t", "c0ck", "c0cks", "c0cksucker", "c0k", "cabron", "caca", "cacker", "cahone", "camel jockey", "camel jockeys", "camel toe", "cameljockey", "cameltoe", "camgirl", "camslut", "camwhore", "carpet muncher", "carpetmuncher", "carruth", "cawk", "cawks", "cazzo", "chav", "cheese eating surrender monkey", "cheese eating surrender monkies", "cheeseeating surrender monkey", "cheeseeating surrender monkies", "cheesehead", "cheeseheads", "cherrypopper", "chickslick", "china swede", "china swedes", "chinaman", "chinamen", "chinaswede", "chinaswedes", "chinc", "chincs", "ching chong", "ching chongs", "chinga", "chingchong", "chingchongs", "chink", "chinks", "chinky", "choad", "chocolate rosebuds", "chode", "chodes", "chonkies", "chonky", "chonkys", "chraa", "christ killer", "christ killers", "chug", "chugs", "chuj", "chunger", "chungers", "chunkies", "chunkys", "cipa", "circlejerk", "cl1t", "clamdigger", "clamdiver", "clamps", "clansman", "clansmen", "clanswoman", "clanswomen", "cleveland steamer", "clit", "clitface", "clitfuck", "clitoris", "clitorus", "clits", "clitty", "clogwog", "clover clamps", "clusterfuck", "cnts", "cntz", "cnut", "cocain", "cocaine", "cock", "cock-head", "cock-sucker", "cockbite", "cockblock", "cockblocker", "cockburger", "cockcowboy", "cockface", "cockfight", "cockfucker", "cockhead", "cockholster", "cockjockey", "cockknob", "cockknocker", "cockknoker", "cocklicker", "cocklover", "cockmaster", "cockmongler", "cockmongruel", "cockmonkey", "cockmunch", "cockmuncher", "cocknob", "cocknose", "cocknugget", "cockqueen", "cockrider", "cocks", "cockshit", "cocksman", "cocksmith", "cocksmoker", "cocksucer", "cocksuck", "cocksucked", "cocksucker", "cocksucking", "cocksucks", "cocksuka", "cocksukka", "cocktease", "cocky", "cohee", "coital", "coitus", "cok", "cokmuncher", "coksucka", "condom", "coochie", "coochy", "coolie", "coolies", "cooly", "coon ass", "coon asses", "coonass", "coonasses", "coondog", "coons", "cooter", "coprolagnia", "coprophilia", "copulate", "corksucker", "cornhole", "cra5h", "crackcocain", "crackpipe", "crackwhore", "crap", "crapola", "crapper", "crappy", "creampie", "crotchjockey", "crotchmonkey", "crotchrot", "cuck", "cum face", "cum licker", "cum", "cumbubble", "cumdumpster", "cumfest", "cumguzzler", "cuming", "cumjockey", "cumlickr", "cumm", "cummer", "cummin", "cumming", "cumquat", "cumqueen", "cums", "cumshot", "cumshots", "cumslut", "cumstain", "cumsucker", "cumtart", "cunilingus", "cunillingus", "cunn", "cunnie", "cunnilingus", "cunntt", "cunny", "cunt", "cunteyed", "cuntface", "cuntfuck", "cuntfucker", "cunthole", "cunthunter", "cuntlick", "cuntlicker", "cuntlicking", "cuntrag", "cunts", "cuntslut", "cuntsucker", "cuntz", "curry muncher", "curry munchers", "currymuncher", "currymunchers", "cushi", "cushis", "cyalis", "cyberfuc", "cyberfuck", "cyberfucked", "cyberfucker", "cyberfuckers", "cyberfucking", "cybersex", "cyberslimer", "d0ng", "d0uch3", "d0uche", "d1ck", "d1ld0", "d1ldo", "d4mn", "dago", "dagos", "dahmer", "damm", "dammit", "damn", "damnit", "darkey", "darkeys", "darkie", "darkies", "darky", "date rape", "daterape", "datnigga", "dawgie style", "dawgie-style", "daygo", "deapthroat", "deep throat", "deep throating", "deepaction", "deepthroat", "deepthroating", "defecate", "deggo", "dego", "degos", "dendrophilia", "destroyyourpussy", "deth", "diaper daddy", "diaper head", "diaper heads", "diaperdaddy", "diaperhead", "diaperheads", "dick pic", "dick", "dick-ish", "dickbag", "dickbeater", "dickbeaters", "dickbrain", "dickdipper", "dickface", "dickflipper", "dickforbrains", "dickfuck", "dickhead", "dickheads", "dickhole", "dickish", "dickjuice", "dickless", "dicklick", "dicklicker", "dickman", "dickmilk", "dickmonger", "dickpic", "dickripper", "dicks", "dicksipper", "dickslap", "dickslicker", "dicksucker", "dickwad", "dickweasel", "dickweed", "dickwhipper", "dickwod", "dickzipper", "diddle", "dike", "dild0", "dild0s", "dildo", "dildos", "dilf", "diligaf", "dilld0", "dilld0s", "dillweed", "dimwit", "dingle", "dingleberries", "dingleberry", "dink", "dinks", "dipship", "dipshit", "dipstick", "dirsa", "dirty pillows", "dirty sanchez", "dix", "dixiedike", "dixiedyke", "dlck", "dog style", "dog-fucker", "doggie style", "doggie", "doggie-style", "doggiestyle", "doggin", "dogging", "doggy style", "doggy-style", "doggystyle", "dolcett", "dominatricks", "dominatrics", "dominatrix", "dommes", "dong", "donkey punch", "donkeypunch", "donkeyribber", "doochbag", "doodoo", "doofus", "dookie", "doosh", "dot head", "dot heads", "dothead", "dotheads", "double dong", "double penetration", "doubledong", "doublepenetration", "douch3", "douche bag", "douche", "douche-fag", "douchebag", "douchebags", "douchewaffle", "douchey", "dp action", "dpaction", "dragqueen", "dragqween", "dripdick", "dry hump", "dryhump", "duche", "dudette", "dumass", "dumb ass", "dumbass", "dumbasses", "dumbbitch", "dumbfuck", "dumbshit", "dumshit", "dune coon", "dune coons", "dupa", "dvda", "dyefly", "dyke", "dykes", "dziwka", "earotics", "easyslut", "eat my ass", "eat my", "eatadick", "eatballs", "eathairpie", "eatme", "eatmyass", "eatpussy", "ecchi", "ejackulate", "ejakulate", "ekrem", "ekto", "enculer", "enema", "erection", "ero", "erotic", "erotism", "esqua", "essohbee", "ethical slut", "evl", "excrement", "exkwew", "extacy", "extasy", "f u c k e r", "f u c k e", "f u c k", "f u k", "f*ck", "f-u-c-k", "f.u.c.k", "f4nny", "f_u_c_k", "facefucker", "fack", "faeces", "faen", "fag", "fag1t", "fagbag", "faget", "fagfucker", "fagg", "fagg1t", "fagged", "fagging", "faggit", "faggitt", "faggot", "faggotcock", "faggs", "fagit", "fagot", "fagots", "fags", "fagt", "fagtard", "fagz", "faig", "faigs", "faigt", "fanculo", "fannybandit", "fannyflaps", "fannyfucker", "fanyy", "fartknocker", "fastfuck", "fatah", "fatfuck", "fatfucker", "fatso", "fck", "fckcum", "fckd", "fcuk", "fcuker", "fcuking", "fecal", "feck", "fecker", "feg", "felatio", "felch", "felcher", "felching", "fellate", "fellatio", "feltch", "feltcher", "feltching", "female squirting", "femalesquirtin", "femalesquirting", "femdom", "fetish", "ficken", "figging", "fingerbang", "fingerfood", "fingerfuck", "fingerfucked", "fingerfucker", "fingerfuckers", "fingerfucking", "fingerfucks", "fingering", "fisted", "fister", "fistfuck", "fistfucked", "fistfucker", "fistfuckers", "fistfucking", "fistfuckings", "fistfucks", "fisting", "fisty", "fitt", "flamer", "flasher", "flikker", "flipping the bird", "flogthelog", "floo", "floozy", "flydie", "flydye", "foad", "fok", "fondle", "foobar", "fook", "fooker", "foot fetish", "footaction", "footfetish", "footfuck", "footfucker", "footjob", "footlicker", "footstar", "foreskin", "forni", "fornicate", "fotze", "foursome", "fourtwenty", "freakfuck", "freakyfucker", "freefuck", "freex", "frigg", "frigga", "frigger", "frotting", "fucck", "fuck", "fuck-tard", "fucka", "fuckable", "fuckass", "fuckbag", "fuckbitch", "fuckbook", "fuckboy", "fuckbrain", "fuckbuddy", "fuckbutt", "fuckd", "fucked", "fuckedup", "fucker", "fuckers", "fuckersucker", "fuckface", "fuckfest", "fuckfreak", "fuckfriend", "fuckhead", "fuckheads", "fuckher", "fuckhole", "fuckin", "fuckina", "fucking", "fuckingbitch", "fuckings", "fuckingshitmotherfucker", "fuckinnuts", "fuckinright", "fuckit", "fuckknob", "fuckme", "fuckmeat", "fuckmehard", "fuckmonkey", "fuckn", "fucknugget", "fucknut", "fucknuts", "fucknutt", "fucknutz", "fuckoff", "fuckpig", "fuckpuppet", "fuckr", "fucks", "fuckstick", "fucktard", "fucktards", "fucktoy", "fucktrophy", "fuckup", "fuckwad", "fuckwhit", "fuckwhore", "fuckwit", "fuckwitt", "fuckyomama", "fuckyou", "fudge packer", "fudgepacker", "fugly", "fuk", "fukah", "fuken", "fuker", "fukin", "fuking", "fukk", "fukkah", "fukken", "fukker", "fukkin", "fukking", "fuks", "fuktard", "fuktards", "fukwhit", "fukwit", "funfuck", "futanari", "futanary", "futkretzn", "fuuck", "fux", "fux0r", "fuxor", "fvck", "fvk", "fxck", "g-spot", "g00k", "gae", "gai", "gang bang", "gangbang", "gangbanged", "gangbanger", "gangbangs", "ganja", "gassyass", "gator bait", "gatorbait", "gay sex", "gayass", "gaybob", "gayboy", "gaydo", "gaygirl", "gaylord", "gaymuthafuckinwhore", "gays", "gaysex", "gaytard", "gaywad", "gayz", "geezer", "geni", "genital", "genitals", "getiton", "gey", "gfy", "ghay", "ghey", "giant cock", "gigolo", "ginzo", "ginzos", "gipp", "gippo", "gippos", "gipps", "girl on top", "girl on", "girls gone wild", "givehead", "glans", "glazeddonut", "goatcx", "goatse", "god dammit", "god damn", "god damnit", "god-dam", "god-damned", "godam", "godammit", "godamn", "godamnit", "goddam", "goddamit", "goddamm", "goddammit", "goddamn", "goddamned", "goddamnes", "goddamnit", "goddamnmuthafucker", "godsdamn", "gokkun", "golden shower", "goldenshower", "golliwog", "golliwogs", "gonad", "gonads", "gonorrehea", "gonzagas", "goo girl", "gooch", "goodpoop", "gook eye", "gook eyes", "gook", "gookeye", "gookeyes", "gookies", "gooks", "gooky", "gora", "goras", "goregasm", "gotohell", "goy", "goyim", "greaseball", "greaseballs", "groe", "groid", "groids", "grope", "grostulation", "group sex", "gspot", "gstring", "gtfo", "gub", "gubba", "gubbas", "gubs", "guido", "guiena", "guineas", "guizi", "gummer", "guro", "gwailo", "gwailos", "gweilo", "gweilos", "gyopo", "gyopos", "gyp", "gyped", "gypo", "gypos", "gypp", "gypped", "gyppie", "gyppies", "gyppo", "gyppos", "gyppy", "gyppys", "gypsys", "h e l l", "h o m", "h00r", "h0ar", "h0m0", "h0mo", "h0r", "h0re", "h4x0r", "hadji", "hadjis", "hairyback", "hairybacks", "haji", "hajis", "hajji", "hajjis", "half breed", "half caste", "halfbreed", "halfcaste", "hamas", "hamflap", "hand job", "handjob", "haole", "haoles", "hapa", "hard core", "hardcore", "hardcoresex", "hardon", "he11", "headfuck", "hebe", "hebes", "heeb", "heebs", "hells", "helvete", "hentai", "heroin", "herp", "herpes", "herpy", "heshe", "hijacking", "hillbillies", "hillbilly", "hindoo", "hiscock", "hitler", "hitlerism", "hitlerist", "hoare", "hobag", "hodgie", "hoer", "hoes", "holestuffer", "hom0", "homo", "homobangers", "homodumbshit", "homoey", "honger", "honkers", "honkey", "honkeys", "honkie", "honkies", "honky", "hooch", "hooker", "hookers", "hoor", "hoore", "hootch", "hooter", "hooters", "hore", "hori", "horis", "hork", "horndawg", "horndog", "horney", "horniest", "horny", "horseshit", "hosejob", "hoser", "hot carl", "hot chick", "hotcarl", "hotdamn", "hotpussy", "hotsex", "hottotrot", "how to kill", "how to murder", "howtokill", "howtomurdep", "huevon", "huge fat", "hugefat", "hui", "hummer", "humped", "humper", "humpher", "humphim", "humpin", "humping", "hussy", "hustler", "hymen", "hymie", "hymies", "iblowu", "ike", "ikes", "ikey", "ikeymo", "ikeymos", "ikwe", "illegals", "incest", "indon", "indons", "injun", "injuns", "insest", "intercourse", "intheass", "inthebuff", "israels", "j3rk0ff", "jack off", "jack-off", "jackass", "jackhole", "jackoff", "jackshit", "jacktheripper", "jail bait", "jailbait", "jap", "japcrap", "japie", "japies", "japs", "jebus", "jelly donut", "jerk off", "jerk-off", "jerk0ff", "jerked", "jerkoff", "jerries", "jerry", "jewboy", "jewed", "jewess", "jiga", "jigaboo", "jigaboos", "jigarooni", "jigaroonis", "jigg", "jigga", "jiggabo", "jiggaboo", "jiggabos", "jiggas", "jigger", "jiggerboo", "jiggers", "jiggs", "jiggy", "jigs", "jihad", "jijjiboo", "jijjiboos", "jimfish", "jisim", "jism", "jiss", "jiz", "jizim", "jizin", "jizjuice", "jizm", "jizn", "jizz", "jizzd", "jizzed", "jizzim", "jizzin", "jizzn", "jizzum", "jugg", "juggs", "jungle bunnies", "jungle bunny", "junglebunny", "junkie", "junky", "kacap", "kacapas", "kacaps", "kaffer", "kaffir", "kaffre", "kafir", "kanake", "kanker", "katsap", "katsaps", "kawk", "khokhol", "khokhols", "kigger", "kike", "kikes", "kimchis", "kinbaku", "kink", "kinkster", "kinky", "kinkyJesus", "kissass", "kiunt", "kkk", "klan", "klansman", "klansmen", "klanswoman", "klanswomen", "klootzak", "knobbing", "knobead", "knobed", "knobend", "knobhead", "knobjocky", "knobjokey", "knobz", "knockers", "knulle", "kock", "kondum", "kondums", "kooch", "kooches", "koon", "kootch", "krap", "krappy", "kraut", "krauts", "kuffar", "kuk", "kuksuger", "kum", "kumbubble", "kumbullbe", "kumer", "kummer", "kumming", "kums", "kunilingus", "kunnilingus", "kunt", "kunts", "kuntz", "kurac", "kurwa", "kushi", "kushis", "kusi", "kwa", "kwai lo", "kwai los", "kwif", "kyke", "kykes", "kyopo", "kyopos", "kyrpa", "l3i+ch", "l3i\\+ch", "l3itch", "labia", "lapdance", "leather restraint", "leather straight", "leatherrestraint", "lebos", "lech", "lemon party", "lemonparty", "leper", "lesbain", "lesbayn", "lesbin", "lesbo", "lesbos", "lez", "lezbe", "lezbefriends", "lezbian", "lezbians", "lezbo", "lezbos", "lezz", "lezzian", "lezzie", "lezzies", "lezzo", "lezzy", "libido", "licker", "licking", "lickme", "lilniglet", "limey", "limpdick", "limy", "lingerie", "lipshits", "lipshitz", "livesex", "loadedgun", "lolita", "lovebone", "lovegoo", "lovegun", "lovejuice", "lovemuscle", "lovepistol", "loverocket", "lowlife", "lsd", "lubejob", "lubra", "lucifer", "luckycammeltoe", "lugan", "lugans", "lusting", "lusty", "lynch", "m-fucking", "m0f0", "m0fo", "m45terbate", "ma5terb8", "ma5terbate", "mabuno", "mabunos", "macaca", "macacas", "mafugly", "magicwand", "mahbuno", "mahbunos", "make me come", "makemecome", "makemecum", "male squirting", "mamhoon", "mams", "manhater", "manpaste", "maricon", "maricón", "marijuana", "masochist", "masokist", "massa", "massterbait", "masstrbait", "masstrbate", "mastabate", "mastabater", "master-bate", "masterb8", "masterbaiter", "masterbat", "masterbat3", "masterbate", "masterbates", "masterbating", "masterbation", "masterbations", "masterblaster", "mastrabator", "masturbat", "masturbate", "masturbating", "masturbation", "mattressprincess", "mau mau", "mau maus", "maumau", "maumaus", "mcfagget", "meatbeatter", "meatrack", "menage", "merd", "mgger", "mggor", "mibun", "mick", "mickeyfinn", "mideast", "mierda", "milf", "mindfuck", "minge", "minger", "mo-fo", "mockey", "mockie", "mocky", "mof0", "mofo", "moky", "molest", "molestation", "molester", "molestor", "moneyshot", "mong", "monkleigh", "moolie", "moon cricket", "moon crickets", "mooncricket", "mooncrickets", "moron", "moskal", "moskals", "moslem", "mosshead", "motha fucker", "motha fuker", "motha fukkah", "motha fukker", "mothafuck", "mothafucka", "mothafuckas", "mothafuckaz", "mothafucked", "mothafucker", "mothafuckers", "mothafuckin", "mothafucking", "mothafuckings", "mothafucks", "mother fucker", "mother fukah", "mother fuker", "mother fukkah", "mother fukker", "mother-fucker", "motherfuck", "motherfucka", "motherfucked", "motherfucker", "motherfuckers", "motherfuckin", "motherfucking", "motherfuckings", "motherfuckka", "motherfucks", "motherfvcker", "motherlovebone", "mothrfucker", "mouliewop", "mound of venus", "moundofvenus", "mr hands", "mrhands", "mtherfucker", "mthrfuck", "mthrfucker", "mthrfucking", "mtrfck", "mtrfuck", "mtrfucker", "muff diver", "muff", "muffdive", "muffdiver", "muffdiving", "muffindiver", "mufflikcer", "muffpuff", "muie", "mulatto", "mulkku", "muncher", "munging", "munt", "munter", "muschi", "mutha fucker", "mutha fukah", "mutha fuker", "mutha fukkah", "mutha fukker", "muthafecker", "muthafuckaz", "muthafucker", "muthafuckker", "muther", "mutherfucker", "mutherfucking", "muthrfucking", "mzungu", "mzungus", "n1gga", "n1gger", "n1gr", "nads", "naked", "nambla", "nastt", "nastybitch", "nastyho", "nastyslut", "nastywhore", "nawashi", "nazi", "nazis", "nazism", "necro", "needthedick", "negres", "negress", "negro", "negroes", "negroid", "negros", "neonazi", "nepesaurio", "nig nog", "nig", "niga", "nigar", "nigars", "nigas", "nigers", "nigette", "nigettes", "nigg", "nigg3r", "nigg4h", "nigga", "niggah", "niggahs", "niggar", "niggaracci", "niggard", "niggarded", "niggarding", "niggardliness", "niggardlinesss", "niggardly", "niggards", "niggars", "niggas", "niggaz", "nigger", "niggerhead", "niggerhole", "niggers", "niggle", "niggled", "niggles", "nigglings", "niggor", "niggress", "niggresses", "nigguh", "nigguhs", "niggur", "niggurs", "niglet", "nignog", "nigor", "nigors", "nigr", "nigra", "nigras", "nigre", "nigres", "nigress", "nigs", "nigur", "niiger", "niigr", "nimphomania", "nimrod", "ninny", "nipple", "nipplering", "nipples", "nips", "nittit", "nlgger", "nlggor", "nob jokey", "nob", "nobhead", "nobjocky", "nobjokey", "nofuckingway", "nog", "nookey", "nookie", "nooky", "noonan", "nooner", "nsfw images", "nsfw", "nudger", "nudie", "nudies", "numbnuts", "nut sack", "nutbutter", "nutfucker", "nutsack", "nutten", "nympho", "nymphomania", "o c k", "octopussy", "omorashi", "one cup two girls", "one guy one jar", "one guy", "one jar", "ontherag", "orafis", "orga", "orgasim", "orgasim;", "orgasims", "orgasm", "orgasmic", "orgasms", "orgasum", "orgies", "orgy", "oriface", "orifiss", "orospu", "osama", "ovum", "ovums", "p e n i s", "p i s", "p u s s y", "p.u.s.s.y.", "p0rn", "packi", "packie", "packy", "paddy", "paedophile", "paki", "pakie", "pakis", "paky", "palesimian", "pancake face", "pancake faces", "panooch", "pansies", "pansy", "panti", "pantie", "panties", "panty", "paska", "payo", "pcp", "pearlnecklace", "pecker", "peckerhead", "peckerwood", "pedo", "pedobear", "pedophile", "pedophilia", "pedophiliac", "peeenus", "peeenusss", "peehole", "peenus", "peepee", "peepshow", "peepshpw", "pegging", "peinus", "pen1s", "penas", "pendejo", "pendy", "penetrate", "penetration", "peni5", "penial", "penile", "penis", "penis-breath", "penises", "penisfucker", "penisland", "penislick", "penislicker", "penispuffer", "penthouse", "penus", "penuus", "perse", "perv", "perversion", "peyote", "phalli", "phallic", "phone sex", "phonesex", "phuc", "phuck", "phuk", "phuked", "phuker", "phuking", "phukked", "phukker", "phukking", "phuks", "phungky", "phuq", "pi55", "picaninny", "piccaninny", "picka", "pickaninnies", "pickaninny", "piece of shit", "pieceofshit", "piefke", "piefkes", "pierdol", "pigfucker", "piker", "pikey", "piky", "pillowbiter", "pillu", "pimmel", "pimp", "pimped", "pimper", "pimpis", "pimpjuic", "pimpjuice", "pimpsimp", "pindick", "pinko", "pis", "pises", "pisin", "pising", "pisof", "piss pig", "piss", "piss-off", "pissed", "pisser", "pissers", "pisses", "pissflap", "pissflaps", "pisshead", "pissin", "pissing", "pissoff", "pisspig", "pizda", "playboy", "playgirl", "pleasure chest", "pleasurechest", "pocha", "pochas", "pocho", "pochos", "pocketpool", "pohm", "pohms", "polac", "polack", "polacks", "polak", "pole smoker", "polesmoker", "pollock", "pollocks", "pommie grant", "pommie grants", "pommy", "ponyplay", "poof", "poon", "poonani", "poonany", "poontang", "poontsee", "poop chute", "poopchute", "pooper", "pooperscooper", "pooping", "poorwhitetrash", "popimp", "porch monkey", "porch monkies", "porchmonkey", "porn", "pornflick", "pornking", "porno", "pornography", "pornos", "pornprincess", "pound town", "poundtown", "pplicker", "pr0n", "pr1c", "pr1ck", "pr1k", "prairie nigger", "prairie niggers", "preteen", "pric", "prickhead", "pricks", "prig", "prince albert piercing", "pron", "prostitute", "pthc", "pu55i", "pu55y", "pube", "pubes", "pubic", "pubiclice", "pubis", "pudboy", "pudd", "puddboy", "pula", "punani", "punanny", "punany", "punkass", "punky", "punta", "puntang", "purinapricness", "pusies", "puss", "pusse", "pussee", "pussi", "pussie", "pussies", "pussy", "pussycat", "pussydestroyer", "pussyeater", "pussyfart", "pussyfuck", "pussyfucker", "pussylicker", "pussylicking", "pussylips", "pussylover", "pussypalace", "pussypounder", "pussys", "pusy", "puta", "puto", "puuke", "puuker", "qahbeh", "quashie", "queaf", "queef", "queerhole", "queero", "queers", "queerz", "quickie", "quicky", "quiff", "quim", "qweers", "qweerz", "qweir", "r-tard", "r-tards", "r5e", "ra8s", "raghead", "ragheads", "rape", "raped", "raper", "raping", "rapist", "rautenberg", "rearend", "rearentry", "recktum", "rectal", "rectum", "rectus", "redleg", "redlegs", "redlight", "redskin", "redskins", "reefer", "reestie", "reetard", "reich", "renob", "rentafuck", "rere", "retard", "retarded", "retards", "retardz", "reverse cowgirl", "reversecowgirl", "rimjaw", "rimjob", "rimming", "ritard", "rosebuds", "rosy palm and her 5 sisters", "rosy palm", "rosypalm", "rosypalmandher5sisters", "rosypalmandherefivesisters", "round eyes", "roundeye", "rtard", "rtards", "rumprammer", "ruski", "russki", "russkie", "rusty trombone", "rustytrombone", "s h i t", "s hit", "s&m", "s-h-1-t", "s-h-i-t", "s-o-b", "s.h.i.t.", "s.o.b.", "s0b", "s_h_i_t", "sadis", "sadism", "sadist", "sadom", "sambo", "sambos", "samckdaddy", "sanchez", "sand nigger", "sand niggers", "sandm", "sandnigger", "santorum", "sausagequeen", "scag", "scallywag", "scank", "scantily", "scat", "schaffer", "scheiss", "schizo", "schlampe", "schlong", "schmuck", "schvartse", "schvartsen", "schwartze", "schwartzen", "scissoring", "screwyou", "scroat", "scrog", "scrote", "scrotum", "scrud", "seduce", "semen", "seppo", "seppos", "septics", "sex", "sexcam", "sexed", "sexfarm", "sexhound", "sexhouse", "sexi", "sexing", "sexkitten", "sexo", "sexpot", "sexslave", "sextogo", "sextoy", "sextoys", "sexual", "sexually", "sexwhore", "sexx", "sexxi", "sexxx", "sexxxi", "sexxxy", "sexxy", "sexy", "sexymoma", "sexyslim", "sh!+", "sh!t", "sh1t", "sh1ter", "sh1ts", "sh1tter", "sh1tz", "shag", "shagger", "shaggin", "shagging", "shamedame", "sharmuta", "sharmute", "shat", "shav", "shaved beaver", "shaved pussy", "shavedbeaver", "shavedpussy", "shawtypimp", "sheeney", "shemale", "shhit", "shi+", "shibari", "shibary", "shinola", "shipal", "shit ass", "shit", "shit-ass", "shit-bag", "shit-bagger", "shit-brain", "shit-breath", "shit-cunt", "shit-dick", "shit-eating", "shit-face", "shit-faced", "shit-fit", "shit-head", "shit-heel", "shit-hole", "shit-house", "shit-load", "shit-pot", "shit-spitter", "shit-stain", "shitass", "shitbag", "shitbagger", "shitblimp", "shitbrain", "shitbreath", "shitcan", "shitcunt", "shitdick", "shite", "shiteater", "shiteating", "shited", "shitey", "shitface", "shitfaced", "shitfit", "shitforbrains", "shitfuck", "shitfucker", "shitfull", "shithapens", "shithappens", "shithead", "shitheel", "shithole", "shithouse", "shiting", "shitings", "shitlist", "shitload", "shitola", "shitoutofluck", "shitpot", "shits", "shitspitter", "shitstain", "shitt", "shitted", "shitter", "shitters", "shittiest", "shitting", "shittings", "shitty", "shity", "shitz", "shiz", "shiznit", "shortfuck", "shota", "shylock", "shylocks", "shyt", "shyte", "shytty", "shyty", "simp", "sissy", "sixsixsix", "sixtynine", "sixtyniner", "skag", "skanck", "skank", "skankbitch", "skankee", "skankey", "skankfuck", "skanks", "skankwhore", "skanky", "skankybitch", "skankywhore", "skeet", "skinflute", "skribz", "skullfuck", "skum", "skumbag", "skurwysyn", "skwa", "skwe", "slag", "slanteye", "slanty", "slapper", "sleezeball", "slideitin", "slimeball", "slimebucket", "slopehead", "slopeheads", "sloper", "slopers", "slopey", "slopeys", "slopies", "slopy", "slut", "slutbag", "slutbucket", "slutdumper", "slutkiss", "sluts", "slutt", "slutting", "slutty", "slutwear", "slutwhore", "slutz", "smackthemonkey", "smeg", "smegma", "smut", "smutty", "snatchpatch", "sniggered", "sniggering", "sniggers", "snowback", "snowballing", "snownigger", "snuff", "socksucker", "sodom", "sodomise", "sodomite", "sodomize", "sodomy", "son of a bitch", "son of a whore", "son-of-a-bitch", "son-of-a-whore", "sonofabitch", "sonofbitch", "sooties", "souse", "soused", "soyboy", "spac", "spaghettibender", "spaghettinigger", "spank", "spankthemonkey", "spastic", "spearchucker", "spearchuckers", "sperm", "spermacide", "spermbag", "spermhearder", "spermherder", "sphencter", "spic", "spick", "spicks", "spics", "spierdalaj", "spig", "spigotty", "spik", "spiks", "splittail", "splooge", "spludge", "spooge", "spread legs", "spreadeagle", "spunk", "spunky", "sqeh", "squa", "squarehead", "squareheads", "squaw", "squinty", "squirting", "stagg", "stfu", "stiffy", "stoned", "stoner", "strap on", "strapon", "strappado", "strip club", "stripclub", "stroking", "stuinties", "stupidfuck", "stupidfucker", "style doggy", "suckdick", "sucked", "sucker", "sucking", "suckme", "suckmyass", "suckmydick", "suckmytit", "suckoff", "suicide girl", "suicide girls", "suicidegirl", "suicidegirls", "suka", "sultrywoman", "sultrywomen", "sumofabiatch", "swallower", "swalow", "swamp guinea", "swamp guineas", "swastika", "syphilis", "t i t", "t i ts", "t1t", "t1tt1e5", "t1tties", "tacohead", "tacoheads", "taff", "take off your", "tar babies", "tar baby", "tarbaby", "tard", "taste my", "tastemy", "tawdry", "tea bagging", "teabagging", "teat", "teets", "teez", "terd", "teste", "testee", "testes", "testical", "testicle", "testicles", "testis", "thicklip", "thicklips", "thirdeye", "thirdleg", "threesome", "threeway", "throating", "thumbzilla", "thundercunt", "tied up", "tig ol bitties", "tig old bitties", "tight white", "timber nigger", "timber niggers", "timbernigger", "tit", "titbitnipply", "titfuck", "titfucker", "titfuckin", "titi", "titjob", "titlicker", "titlover", "tits", "titt", "tittie", "tittie5", "tittiefucker", "titties", "tittis", "titty", "tittyfuck", "tittyfucker", "tittys", "tittywank", "titwank", "tity", "to murder", "tongethruster", "tongue in a", "tongueina", "tonguethrust", "tonguetramp", "toots", "topless", "tortur", "torture", "tosser", "towel head", "towel heads", "towelhead", "trailertrash", "trannie", "tranny", "transsexual", "transvestite", "tribadism", "trisexual", "trois", "trots", "tub girl", "tubgirl", "tuckahoe", "tunneloflove", "turd burgler", "turnon", "tush", "tushy", "tw4t", "twat", "twathead", "twatlips", "twats", "twatty", "twatwaffle", "twink", "twinkie", "two girls one cup", "twobitwhore", "twunt", "twunter", "udge packer", "ukrop", "unclefucker", "unfuckable", "upskirt", "uptheass", "upthebutt", "urethra play", "urethraplay", "urophilia", "usama", "ussys", "uzi", "v a g i n a", "v14gra", "v1gra", "v4gra", "va-j-j", "va1jina", "vag", "vag1na", "vagiina", "vaj1na", "vajina", "valium", "venus mound", "vgra", "vibr", "vibrater", "vibrator", "vigra", "violet wand", "virginbreaker", "vittu", "vixen", "vjayjay", "vorarephilia", "voyeurweb", "voyuer", "vullva", "vulva", "w00se", "w0p", "wab", "wang", "wank", "wanker", "wanking", "wanky", "waysted", "wazoo", "weenie", "weewee", "weiner", "welcher", "wench", "wet dream", "wetb", "wetback", "wetbacks", "wetdream", "wetspot", "wh00r", "wh0re", "wh0reface", "whacker", "whash", "whigger", "whiggers", "whiskeydick", "whiskydick", "whit", "white power", "white trash", "whitenigger", "whitepower", "whitetrash", "whitey", "whiteys", "whities", "whoar", "whop", "whoralicious", "whore", "whorealicious", "whorebag", "whored", "whoreface", "whorefucker", "whorehopper", "whorehouse", "whores", "whoring", "wichser", "wigga", "wiggas", "wigger", "wiggers", "willie", "willies", "williewanker", "willy", "wog", "wogs", "woose", "wop", "worldsex", "wrapping men",  "wrinkled starfish",  "wtf",  "wuss", "wuzzie",  "x-rated", "x-rated2g1c",  "xkwe", "xrated",  "xtc",  "xx",  "xxx", "xxxxxx",  "yank",  "yaoi",  "yarpie",  "yarpies",  "yed",  "yellow showers",  "yellowman",  "yellowshowers",  "yid",   "yids",  "yiffy", "yobbo","yourboobs",  "yourpenis",  "yourtits",  "yury",  "zabourah","zigabo",  "zigabos",  "zipperhead",  "zipperheads",  "zoophile", "zoophilia", "🖕"];
  
  const lowerText = text.toLowerCase();
  
  // Check for exact matches and partial matches
  for (let word of profanityList) {
    // Check if the word appears as a whole word or part of a word
    const regex = new RegExp('\\b' + word + '\\b|' + word, 'i');
    if (regex.test(lowerText)) {
      return true;
    }
  }
  
  return false;
}

function addTextToCanvas() {
  const content = (freeTextInput.value || '').trim();
  if (!content || !currentRoomId) return;
  
  // Check for profanity only in public room
  if (currentRoomId === 'public' && containsProfanity(content)) {
    alert('Your text contains inappropriate language. Please use respectful language.');
    return;
  }
  
  const size = getTextSize();
  const font = getTextFont();
  
  // Measure the text to find appropriate empty space
  ctx.font = `${size}px ${font}`;
  const textWidth = ctx.measureText(content).width;
  const textHeight = size;
  
  // Check if text can fit anywhere on the canvas (with margins)
  const margin = 50;
  const maxWidth = canvas.width - (margin * 2);
  const maxHeight = canvas.height - (margin * 2);
  
  if (textWidth > maxWidth || textHeight > maxHeight) {
    // Calculate the maximum font size that would fit
    let maxFontSize = size;
    
    if (textWidth > maxWidth) {
      // Scale down based on width
      maxFontSize = Math.floor((maxWidth / textWidth) * size);
    }
    
    if (textHeight > maxHeight && maxFontSize > maxHeight) {
      // Also check height constraint
      maxFontSize = Math.min(maxFontSize, maxHeight);
    }
    
    alert(`Error: Text is too large to fit on the canvas!\n\nCurrent font size: ${size}px\nMaximum font size that would fit: ${maxFontSize}px\n\nPlease reduce the text size and try again.`);
    return;
  }
  
  const { x, y } = findEmptySpace(textWidth, textHeight);
  
  // Final check: make sure the found position actually fits on canvas
  if (x + textWidth > canvas.width || y + textHeight > canvas.height) {
    alert(`Error: Cannot find space on canvas for text of this size.\n\nCurrent font size: ${size}px\nTry reducing the text size or clearing some existing text.`);
    return;
  }
  
  textsRef.push({ x, y, text: content, size, color: brushColor, font });
  freeTextInput.value = '';
}

// Add text when Enter key is pressed
freeTextInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTextToCanvas();
  }
});

// ==================== Room UI ====================
const roomDropdown = document.getElementById('roomDropdown');
const roomMenuBtn = document.getElementById('roomMenuBtn');

roomMenuBtn?.addEventListener('click', () => {
  roomDropdown.classList.toggle('show');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.room-menu-container')) {
    roomDropdown?.classList.remove('show');
  }
});

document.getElementById('createRoomBtn')?.addEventListener('click', async () => {
  const roomId = generateRoomCode();
  const password = prompt('Set a passkey for this room (optional - leave blank for no password):');

  if (password && password.trim()) {
    await db.ref(`rooms/${roomId}/password`).set(password.trim());
  } else {
    await db.ref(`rooms/${roomId}/created`).set(true);
  }

  joinRoom(roomId);
  roomDropdown.classList.remove('show');
});

document.getElementById('joinRoomBtn')?.addEventListener('click', () => {
  const roomId = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (roomId) {
    joinRoom(roomId);
    roomDropdown.classList.remove('show');
  }
});

document.getElementById('goPublicBtn')?.addEventListener('click', () => {
  joinRoom('public');
  roomDropdown.classList.remove('show');
});

document.getElementById('copyRoomBtn')?.addEventListener('click', () => {
  if (currentRoomId && currentRoomId !== 'public') {
    navigator.clipboard.writeText(currentRoomId);
    const btn = document.getElementById('copyRoomBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = originalText, 1500);
  }
});

document.getElementById('deleteRoomBtn')?.addEventListener('click', async () => {
  if (currentRoomId && currentRoomId !== 'public') {
    const confirmDelete = confirm(`Are you sure you want to delete room ${currentRoomId}? This will kick all users from the room.`);
    if (confirmDelete) {
      // Turn off deletion listener before deleting
      if (roomDeletedRef) roomDeletedRef.off();
      
      await db.ref(`rooms/${currentRoomId}/deleted`).set(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      await db.ref(`rooms/${currentRoomId}`).remove();
      
      joinRoom('public');
      roomDropdown.classList.remove('show');
    }
  }
});

// ==================== Page Management ====================
const pageDropdown = document.getElementById('pageDropdown');
const pageMenuBtn = document.getElementById('pageMenuBtn');

pageMenuBtn?.addEventListener('click', () => {
  pageDropdown.classList.toggle('show');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.page-menu-container')) {
    pageDropdown?.classList.remove('show');
  }
});

// Load and display pages
async function loadPagesList() {
  const pageListEl = document.getElementById('pagesList');
  if (!pageListEl || !currentRoomId) return;
  
  try {
    const pagesSnapshot = await db.ref(`rooms/${currentRoomId}/pages`).once('value');
    const pages = pagesSnapshot.val();
    
    pageListEl.innerHTML = '';
    
    if (!pages) {
      // No pages exist yet - create default page 1 entry
      await db.ref(`rooms/${currentRoomId}/pages/page1/name`).set('Page 1');
      await db.ref(`rooms/${currentRoomId}/pages/page1/created`).set(true);
      
      const pageBtn = createPageButton('page1', 1, 'Page 1', true);
      pageListEl.appendChild(pageBtn);
      return;
    }
    
    // Get all page numbers
    const pageIds = Object.keys(pages).sort((a, b) => {
      const numA = parseInt(a.replace('page', ''));
      const numB = parseInt(b.replace('page', ''));
      return numA - numB;
    });
    
    pageIds.forEach(pageId => {
      const pageNum = parseInt(pageId.replace('page', ''));
      const pageName = pages[pageId].name || `Page ${pageNum}`;
      const isActive = pageId === currentPageId;
      const pageBtn = createPageButton(pageId, pageNum, pageName, isActive);
      pageListEl.appendChild(pageBtn);
    });
    
  } catch (err) {
    console.error('Error loading pages:', err);
  }
}

function createPageButton(pageId, pageNum, pageName, isActive) {
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px;';
  
  const btn = document.createElement('button');
  btn.textContent = pageName;
  btn.className = isActive ? 'page-btn active' : 'page-btn';
  btn.style.flex = '1';
  btn.onclick = () => {
    switchPage(pageId);
    pageDropdown.classList.remove('show');
    loadPagesList();
  };
  
  const renameBtn = document.createElement('button');
  renameBtn.textContent = '✎';
  renameBtn.className = 'page-action-btn';
  renameBtn.title = 'Rename page';
  renameBtn.onclick = async (e) => {
    e.stopPropagation();
    const newName = prompt('Enter new page name:', pageName);
    if (newName && newName.trim()) {
      await db.ref(`rooms/${currentRoomId}/pages/${pageId}/name`).set(newName.trim());
      loadPagesList();
      if (pageId === currentPageId) {
        updatePageIndicator();
      }
    }
  };
  
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '✕';
  deleteBtn.className = 'page-action-btn destructive';
  deleteBtn.title = 'Delete page';
  deleteBtn.onclick = async (e) => {
    e.stopPropagation();
    
    // Count total pages
    const pagesSnapshot = await db.ref(`rooms/${currentRoomId}/pages`).once('value');
    const pages = pagesSnapshot.val();
    const pageCount = pages ? Object.keys(pages).length : 0;
    
    if (pageCount <= 1) {
      alert('Cannot delete the last page. Each room must have at least one page.');
      return;
    }
    
    if (confirm(`Delete "${pageName}"? This will permanently remove all drawings and text on this page.`)) {
      await db.ref(`rooms/${currentRoomId}/pages/${pageId}`).remove();
      
      // If we deleted the current page, switch to page1
      if (pageId === currentPageId) {
        const remainingPages = Object.keys(pages).filter(id => id !== pageId);
        switchPage(remainingPages[0] || 'page1');
      }
      
      loadPagesList();
    }
  };
  
  container.appendChild(btn);
  container.appendChild(renameBtn);
  container.appendChild(deleteBtn);
  
  return container;
}

document.getElementById('createPageBtn')?.addEventListener('click', async () => {
  try {
    // Find the highest page number
    const pagesSnapshot = await db.ref(`rooms/${currentRoomId}/pages`).once('value');
    const pages = pagesSnapshot.val();
    
    let maxPageNum = 1;
    if (pages) {
      Object.keys(pages).forEach(pageId => {
        const num = parseInt(pageId.replace('page', ''));
        if (num > maxPageNum) maxPageNum = num;
      });
    }
    
    const newPageNum = maxPageNum + 1;
    const newPageId = `page${newPageNum}`;
    
    // Ask for page name
    const pageName = prompt('Enter name for the new page:', `Page ${newPageNum}`);
    if (pageName === null) return; // User cancelled
    
    // Create the new page with a name
    await db.ref(`rooms/${currentRoomId}/pages/${newPageId}/name`).set(pageName.trim() || `Page ${newPageNum}`);
    await db.ref(`rooms/${currentRoomId}/pages/${newPageId}/created`).set(true);
    
    // Switch to the new page
    switchPage(newPageId);
    pageDropdown.classList.remove('show');
    loadPagesList();
    
  } catch (err) {
    console.error('Error creating page:', err);
    alert('Failed to create new page. Please try again.');
  }
});

// Refresh pages list when dropdown is opened
pageMenuBtn?.addEventListener('click', () => {
  if (currentRoomId !== 'public' && pageDropdown.classList.contains('show')) {
    loadPagesList();
  }
});

// ==================== Admin ====================
(function setupAdmin() {
  const adminKey = "cooper";
  const isAdmin = prompt("Enter admin key to see admin tools (or cancel):") === adminKey;
  if (isAdmin) {
    clearBtn.style.display = 'inline-block';
    clearBtn.addEventListener('click', async () => {
      if (!currentRoomId) return;
      if (!confirm('Clear entire canvas? This will remove all drawings and text for everyone.')) return;
      try {
        if (currentRoomId === 'public') {
          // Set a cleared flag first
          await db.ref(`rooms/${currentRoomId}/cleared`).set(Date.now());
          
          // Then remove the data from Firebase
          await db.ref(`rooms/${currentRoomId}/lines`).remove();
          await db.ref(`rooms/${currentRoomId}/texts`).remove();
        } else {
          // Set a cleared flag first
          await db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/cleared`).set(Date.now());
          
          // Then remove the data from Firebase
          await db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/lines`).remove();
          await db.ref(`rooms/${currentRoomId}/pages/${currentPageId}/texts`).remove();
        }
        
        // Clear local cache
        linesCache.length = 0;
        textsCache.clear();
        drawAll();
      } catch (err) {
        console.error('Failed to clear canvas data:', err);
        alert('Failed to clear canvas. Please try again.');
      }
    });
    
    const adminRoomBtn = document.createElement('button');
    adminRoomBtn.textContent = 'Manage Rooms';
    adminRoomBtn.className = 'secondary';
    adminRoomBtn.style.display = 'inline-block';
    document.getElementById('toolbar').appendChild(adminRoomBtn);
    
    const adminPanel = document.createElement('div');
    adminPanel.id = 'adminPanel';
    adminPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: hsl(217, 25%, 16%);
      border: 1px solid hsl(217, 22%, 20%);
      border-radius: 12px;
      padding: 20px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0px 30px 60px -12px hsl(0 0% 0% / 0.60);
      z-index: 2000;
      display: none;
    `;
    
    const panelTitle = document.createElement('h2');
    panelTitle.textContent = 'Admin: Room Management';
    panelTitle.style.cssText = 'margin-bottom: 16px; color: hsl(217, 10%, 92%); font-size: 18px;';
    adminPanel.appendChild(panelTitle);
    
    const roomList = document.createElement('div');
    roomList.id = 'adminRoomList';
    adminPanel.appendChild(roomList);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
      margin-top: 16px;
      padding: 8px 16px;
      background: hsl(217, 20%, 24%);
      color: hsl(217, 10%, 88%);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      width: 100%;
    `;
    closeBtn.onclick = () => { adminPanel.style.display = 'none'; };
    adminPanel.appendChild(closeBtn);
    
    document.body.appendChild(adminPanel);
    
    adminRoomBtn.addEventListener('click', async () => {
      adminPanel.style.display = 'block';
      roomList.innerHTML = '<p style="color: hsl(217, 10%, 80%);">Loading rooms...</p>';
      
      try {
        const roomsSnapshot = await db.ref('rooms').once('value');
        const rooms = roomsSnapshot.val();
        
        if (!rooms) {
          roomList.innerHTML = '<p style="color: hsl(217, 10%, 80%);">No private rooms found.</p>';
          return;
        }
        
        roomList.innerHTML = '';
        
        Object.keys(rooms).forEach(roomId => {
          if (roomId === 'public') return;
          
          const roomData = rooms[roomId];
          const password = roomData.password || 'None';
          const lineCount = roomData.lines ? Object.keys(roomData.lines).length : 0;
          const textCount = roomData.texts ? Object.keys(roomData.texts).length : 0;
          
          let lastActivity = 'Unknown';
          let lastTimestamp = 0;
          
          if (roomData.lines) {
            Object.values(roomData.lines).forEach(line => {
              if (line.timestamp && line.timestamp > lastTimestamp) {
                lastTimestamp = line.timestamp;
              }
            });
          }
          if (roomData.texts) {
            Object.values(roomData.texts).forEach(text => {
              if (text.timestamp && text.timestamp > lastTimestamp) {
                lastTimestamp = text.timestamp;
              }
            });
          }
          
          if (lastTimestamp > 0) {
            const date = new Date(lastTimestamp);
            lastActivity = date.toLocaleString();
          }
          
          const roomCard = document.createElement('div');
          roomCard.style.cssText = `
            background: hsl(217, 20%, 20%);
            border: 1px solid hsl(217, 20%, 25%);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 12px;
          `;
          
          roomCard.innerHTML = `
            <div style="color: hsl(220, 90%, 56%); font-weight: 600; font-family: 'JetBrains Mono', monospace; margin-bottom: 8px;">
              ${roomId}
            </div>
            <div style="color: hsl(217, 10%, 80%); font-size: 13px; margin-bottom: 8px;">
              <div>Password: ${password}</div>
              <div>Lines: ${lineCount} | Texts: ${textCount}</div>
              <div>Last Activity: ${lastActivity}</div>
            </div>
          `;
          
          const btnContainer = document.createElement('div');
          btnContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 8px;';
          
          const previewBtn = document.createElement('button');
          previewBtn.textContent = 'Preview';
          previewBtn.style.cssText = `
            padding: 6px 12px;
            background: hsl(220, 90%, 56%);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            flex: 1;
          `;
          previewBtn.onclick = () => {
            window.open(`#${roomId}`, '_blank');
          };
          
          const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete';
          deleteBtn.style.cssText = `
            padding: 6px 12px;
            background: hsl(0, 84%, 48%);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            flex: 1;
          `;
          deleteBtn.onclick = async () => {
            if (confirm(`Delete room ${roomId}? This will kick all users.`)) {
              await db.ref(`rooms/${roomId}/deleted`).set(true);
              await new Promise(resolve => setTimeout(resolve, 500));
              await db.ref(`rooms/${roomId}`).remove();
              adminRoomBtn.click();
            }
          };
          
          btnContainer.appendChild(previewBtn);
          btnContainer.appendChild(deleteBtn);
          roomCard.appendChild(btnContainer);
          roomList.appendChild(roomCard);
        });
        
      } catch (err) {
        console.error('Error loading rooms:', err);
        roomList.innerHTML = '<p style="color: hsl(0, 84%, 48%);">Error loading rooms.</p>';
      }
    });
  }
})();

// ==================== Initialize ====================
window.addEventListener('load', () => {
  const hashRoom = window.location.hash.substring(1);
  if (hashRoom) {
    joinRoom(hashRoom);
  } else {
    joinRoom('public');
  }
});

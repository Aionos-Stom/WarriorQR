/**
 * Historial local cifrado de códigos QR generados.
 *
 * Nada de esto sale del dispositivo: se guarda en IndexedDB del navegador,
 * cifrado con AES-GCM 256 bits (Web Crypto API). La clave se genera una vez
 * como no-extraíble y vive solo en la base de datos local del navegador,
 * por lo que el contenido no queda en texto plano en el almacenamiento.
 *
 * Esto no protege contra alguien con acceso root/depurador al dispositivo,
 * pero sí evita que el contenido quede legible con solo abrir DevTools
 * o inspeccionar el storage del navegador.
 */
const WarriorHistory = (() => {
  "use strict";

  const DB_NAME = "warriorqr-history";
  const DB_VERSION = 1;
  const STORE_KEYS = "keys";
  const STORE_ITEMS = "items";
  const KEY_ID = "master";
  const MAX_ITEMS = 12;

  function isSupported() {
    return typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && !!crypto.subtle;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KEYS)) db.createObjectStore(STORE_KEYS);
        if (!db.objectStoreNames.contains(STORE_ITEMS)) db.createObjectStore(STORE_ITEMS, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbPut(db, storeName, value, key) {
    return new Promise((resolve, reject) => {
      const store = db.transaction(storeName, "readwrite").objectStore(storeName);
      const req = key !== undefined ? store.put(value, key) : store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbDelete(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function idbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function idbClear(db, storeName) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(storeName, "readwrite").objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function getOrCreateKey(db) {
    const existing = await idbGet(db, STORE_KEYS, KEY_ID);
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await idbPut(db, STORE_KEYS, key, KEY_ID);
    return key;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function encryptJson(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(obj));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    return { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
  }

  async function decryptJson(key, record) {
    const iv = new Uint8Array(record.iv);
    const ciphertext = new Uint8Array(record.ciphertext).buffer;
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  async function add(entry) {
    if (!isSupported()) return null;
    try {
      const db = await openDb();
      const key = await getOrCreateKey(db);
      const hash = await sha256Hex(`${entry.type}:${entry.data}`);

      const existingItems = await idbGetAll(db, STORE_ITEMS);
      const duplicate = existingItems.find(i => i.hash === hash);
      if (duplicate) await idbDelete(db, STORE_ITEMS, duplicate.id);

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { iv, ciphertext } = await encryptJson(key, {
        type: entry.type,
        data: entry.data,
        label: entry.label || "",
        fields: entry.fields || {}
      });

      await idbPut(db, STORE_ITEMS, { id, hash, iv, ciphertext, ts: Date.now() });

      const all = await idbGetAll(db, STORE_ITEMS);
      if (all.length > MAX_ITEMS) {
        all.sort((a, b) => a.ts - b.ts);
        for (const item of all.slice(0, all.length - MAX_ITEMS)) {
          await idbDelete(db, STORE_ITEMS, item.id);
        }
      }
      return id;
    } catch (err) {
      console.error("WarriorHistory.add falló:", err);
      return null;
    }
  }

  async function list() {
    if (!isSupported()) return [];
    try {
      const db = await openDb();
      const key = await getOrCreateKey(db);
      const items = await idbGetAll(db, STORE_ITEMS);
      items.sort((a, b) => b.ts - a.ts);

      const decrypted = [];
      for (const item of items) {
        try {
          const plain = await decryptJson(key, item);
          decrypted.push({ id: item.id, ts: item.ts, ...plain });
        } catch {
          // Entrada ilegible (clave distinta o dato corrupto): se omite en vez de romper la lista.
        }
      }
      return decrypted;
    } catch (err) {
      console.error("WarriorHistory.list falló:", err);
      return [];
    }
  }

  async function remove(id) {
    if (!isSupported()) return;
    try {
      const db = await openDb();
      await idbDelete(db, STORE_ITEMS, id);
    } catch (err) {
      console.error("WarriorHistory.remove falló:", err);
    }
  }

  async function clear() {
    if (!isSupported()) return;
    try {
      const db = await openDb();
      await idbClear(db, STORE_ITEMS);
    } catch (err) {
      console.error("WarriorHistory.clear falló:", err);
    }
  }

  return { isSupported, add, list, remove, clear };
})();

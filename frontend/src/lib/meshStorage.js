/**
 * Quinn Rigger - local binary mesh storage
 *
 * Stores imported GLB / GLTF / OBJ / FBX files inside IndexedDB.
 * This is separate from localStorage because character meshes can be
 * hundreds of MB and must not be serialized into project JSON.
 */

const DB_NAME = 'QuinnRiggerLocalAssets';
const DB_VERSION = 1;
const STORE_NAME = 'meshes';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    request.onerror = () => {
      reject(
        request.error ||
          new Error(
            'Could not open local mesh database'
          )
      );
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (
        !db.objectStoreNames.contains(
          STORE_NAME
        )
      ) {
        const store =
          db.createObjectStore(
            STORE_NAME,
            {
              keyPath: 'id',
            }
          );

        store.createIndex(
          'filename',
          'filename',
          {
            unique: false,
          }
        );

        store.createIndex(
          'saved_at',
          'saved_at',
          {
            unique: false,
          }
        );
      }
    };

    request.onsuccess = () => {
      resolve(
        request.result
      );
    };
  });
}

function createAssetId() {
  if (
    globalThis.crypto
      ?.randomUUID
  ) {
    return `mesh-${globalThis.crypto.randomUUID()}`;
  }

  return `mesh-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export async function storeMeshFile(
  file,
  existingId = null
) {
  if (!file) {
    throw new Error(
      'No mesh file supplied'
    );
  }

  const db =
    await openDatabase();

  const id =
    existingId ||
    createAssetId();

  const record = {
    id,

    filename:
      file.name ||
      'mesh',

    type:
      file.type ||
      'application/octet-stream',

    size:
      file.size || 0,

    last_modified:
      file.lastModified ||
      Date.now(),

    saved_at:
      new Date().toISOString(),

    blob: file,
  };

  await new Promise(
    (resolve, reject) => {
      const tx =
        db.transaction(
          STORE_NAME,
          'readwrite'
        );

      const store =
        tx.objectStore(
          STORE_NAME
        );

      const request =
        store.put(
          record
        );

      request.onerror = () => {
        reject(
          request.error ||
            new Error(
              'Could not save mesh locally'
            )
        );
      };

      tx.oncomplete = () => {
        resolve();
      };

      tx.onerror = () => {
        reject(
          tx.error ||
            new Error(
              'Could not save mesh locally'
            )
        );
      };
    }
  );

  db.close();

  return {
    id,
    filename:
      record.filename,
    size:
      record.size,
    saved_at:
      record.saved_at,
  };
}

export async function getStoredMeshRecord(
  id
) {
  if (!id) {
    return null;
  }

  const db =
    await openDatabase();

  const record =
    await new Promise(
      (resolve, reject) => {
        const tx =
          db.transaction(
            STORE_NAME,
            'readonly'
          );

        const store =
          tx.objectStore(
            STORE_NAME
          );

        const request =
          store.get(id);

        request.onsuccess =
          () => {
            resolve(
              request.result ||
                null
            );
          };

        request.onerror =
          () => {
            reject(
              request.error ||
                new Error(
                  'Could not read stored mesh'
                )
            );
          };
      }
    );

  db.close();

  return record;
}

export async function restoreMeshFile(
  id
) {
  const record =
    await getStoredMeshRecord(
      id
    );

  if (!record) {
    return null;
  }

  const blob =
    record.blob;

  if (!blob) {
    return null;
  }

  return new File(
    [blob],
    record.filename ||
      'mesh',
    {
      type:
        record.type ||
        blob.type ||
        'application/octet-stream',

      lastModified:
        record.last_modified ||
        Date.now(),
    }
  );
}

export async function deleteStoredMesh(
  id
) {
  if (!id) {
    return;
  }

  const db =
    await openDatabase();

  await new Promise(
    (resolve, reject) => {
      const tx =
        db.transaction(
          STORE_NAME,
          'readwrite'
        );

      const store =
        tx.objectStore(
          STORE_NAME
        );

      store.delete(id);

      tx.oncomplete =
        () => resolve();

      tx.onerror = () =>
        reject(
          tx.error ||
            new Error(
              'Could not delete stored mesh'
            )
        );
    }
  );

  db.close();
}

export async function hasStoredMesh(
  id
) {
  if (!id) {
    return false;
  }

  const record =
    await getStoredMeshRecord(
      id
    );

  return !!record;
}

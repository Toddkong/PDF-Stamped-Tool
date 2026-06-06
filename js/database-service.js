// 数据库服务类 - 使用IndexedDB实现数据持久化
class DatabaseService {
    constructor() {
        this.dbName = 'PdfSignerDB';
        this.dbVersion = 1;
        this.db = null;
    }

    // 初始化数据库连接
    init() {
        return new Promise((resolve, reject) => {
            // 打开数据库连接
            const request = indexedDB.open(this.dbName, this.dbVersion);

            // 数据库升级或首次创建时触发
            request.onupgradeneeded = (event) => {
                this.db = event.target.result;

                // 创建签章存储对象
                if (!this.db.objectStoreNames.contains('signatures')) {
                    const signatureStore = this.db.createObjectStore('signatures', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    signatureStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // 创建盖章文档存储对象
                if (!this.db.objectStoreNames.contains('signedDocuments')) {
                    const documentStore = this.db.createObjectStore('signedDocuments', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    documentStore.createIndex('createdAt', 'createdAt', { unique: false });
                    documentStore.createIndex('name', 'name', { unique: false });
                }
            };

            // 数据库打开成功
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            // 数据库打开失败
            request.onerror = (event) => {
                reject(new Error('数据库连接失败: ' + event.target.errorCode));
            };
        });
    }

    // 获取事务对象
    getTransaction(storeNames, mode = 'readonly') {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }
        return this.db.transaction(storeNames, mode);
    }

    // 保存签章
    saveSignature(signature) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.getTransaction(['signatures'], 'readwrite');
                const store = transaction.objectStore('signatures');
                
                // 如果没有ID，设置一个新ID
                if (!signature.id) {
                    signature.id = DatabaseService.generateId();
                }
                
                // 确保有创建时间
                if (!signature.createdAt) {
                    signature.createdAt = Date.now();
                }
                
                const request = store.put(signature);
                
                request.onsuccess = () => {
                    resolve(signature);
                };
                
                request.onerror = (event) => {
                    reject(new Error('保存签章失败: ' + event.target.errorCode));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    // 获取所有签章
    getAllSignatures() {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.getTransaction(['signatures']);
                const store = transaction.objectStore('signatures');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = (event) => {
                    reject(new Error('获取签章失败: ' + event.target.errorCode));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    // 删除签章
    deleteSignature(id) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.getTransaction(['signatures'], 'readwrite');
                const store = transaction.objectStore('signatures');
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    resolve();
                };
                
                request.onerror = (event) => {
                    reject(new Error('删除签章失败: ' + event.target.errorCode));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    // 保存盖章后的文档
    saveSignedDocument(document) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.getTransaction(['signedDocuments'], 'readwrite');
                const store = transaction.objectStore('signedDocuments');
                
                // 如果没有ID，设置一个新ID
                if (!document.id) {
                    document.id = DatabaseService.generateId();
                }
                
                // 确保有创建时间
                if (!document.createdAt) {
                    document.createdAt = Date.now();
                }
                
                const request = store.put(document);
                
                request.onsuccess = () => {
                    resolve(document);
                };
                
                request.onerror = (event) => {
                    reject(new Error('保存文档失败: ' + event.target.errorCode));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    // 获取所有盖章文档
    getAllSignedDocuments() {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.getTransaction(['signedDocuments']);
                const store = transaction.objectStore('signedDocuments');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = (event) => {
                    reject(new Error('获取文档失败: ' + event.target.errorCode));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    // 删除盖章文档
    deleteSignedDocument(id) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = this.getTransaction(['signedDocuments'], 'readwrite');
                const store = transaction.objectStore('signedDocuments');
                const request = store.delete(id);
                
                request.onsuccess = () => {
                    resolve();
                };
                
                request.onerror = (event) => {
                    reject(new Error('删除文档失败: ' + event.target.errorCode));
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    // 生成唯一ID
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

// 导出DatabaseService类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseService;
} else if (typeof window !== 'undefined') {
    window.DatabaseService = DatabaseService;
}
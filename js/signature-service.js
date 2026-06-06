// 签章管理服务类
class SignatureService {
    constructor() {
        this.dbService = new DatabaseService();
        this.initialized = false;
    }
    
    // 初始化数据库连接
    async init() {
        if (!this.initialized) {
            await this.dbService.init();
            this.initialized = true;
        }
    }
    
    // 保存签章
    async saveSignature(signature) {
        await this.init();
        
        const newSignature = {
            ...signature,
            createdAt: Date.now()
        };
        
        return await this.dbService.saveSignature(newSignature);
    }
    
    // 加载所有签章
    async loadSignatures() {
        await this.init();
        return await this.dbService.getAllSignatures();
    }
    
    // 删除签章
    async deleteSignature(id) {
        await this.init();
        return await this.dbService.deleteSignature(id);
    }
    
    // 获取默认签章
    async getDefaultSignature() {
        await this.init();
        const signatures = await this.dbService.getAllSignatures();
        if (signatures.length > 0) {
            // 返回第一个签章作为默认
            return signatures[0];
        } else {
            return null;
        }
    }
}

// 为了兼容旧版浏览器，添加Promise polyfill（如果需要）
if (typeof Promise === 'undefined') {
    window.Promise = function(resolver) {
        // 简化的Promise实现，仅用于基本功能
        this.thenCallbacks = [];
        this.catchCallbacks = [];
        
        const resolve = (value) => {
            setTimeout(() => {
                this.thenCallbacks.forEach(callback => callback(value));
            }, 0);
        };
        
        const reject = (reason) => {
            setTimeout(() => {
                this.catchCallbacks.forEach(callback => callback(reason));
            }, 0);
        };
        
        resolver(resolve, reject);
    };
    
    window.Promise.prototype.then = function(onFulfilled) {
        this.thenCallbacks.push(onFulfilled);
        return this;
    };
    
    window.Promise.prototype.catch = function(onRejected) {
        this.catchCallbacks.push(onRejected);
        return this;
    };
}
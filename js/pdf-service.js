// PDF处理服务类
class PdfService {
    constructor(containerId, pdfDataUrl, originalFileName) {
        this.containerId = containerId;
        this.pdfDataUrl = pdfDataUrl;
        this.originalFileName = originalFileName || 'document';
        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.signatures = []; // 存储所有页面的签章信息
        this.selectedSignature = null; // 当前选中的签章
        this.dbService = new DatabaseService();
        this.dbInitialized = false;
        
        // 设置PDF.js的worker路径
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    
    // 初始化PDF加载
    init() {
        return new Promise(async (resolve, reject) => {
            try {
                // 初始化数据库连接
                await this.dbService.init();
                this.dbInitialized = true;
            } catch (dbError) {
                console.warn('数据库初始化失败，将使用本地存储:', dbError);
            }
            
            // 从DataURL加载PDF
            const loadingTask = pdfjsLib.getDocument(this.pdfDataUrl);
            
            loadingTask.promise.then((pdfDoc) => {
                this.pdfDoc = pdfDoc;
                this.totalPages = pdfDoc.numPages;
                
                // 初始化签章存储
                this.signatures = new Array(this.totalPages).fill(null).map(() => []);
                
                // 渲染第一页
                this.renderPage(this.currentPage);
                
                // 更新页面信息
                this.updatePageInfo();
                
                resolve();
            }).catch((error) => {
                console.error('加载PDF失败:', error);
                reject(error);
            });
        });
    }
    
    // 渲染指定页面
    renderPage(pageNum) {
        return new Promise((resolve, reject) => {
            if (pageNum < 1 || pageNum > this.totalPages) {
                reject(new Error('页码超出范围'));
                return;
            }
            
            this.currentPage = pageNum;
            
            // 获取页面
            this.pdfDoc.getPage(pageNum).then((page) => {
                const viewport = page.getViewport({ scale: this.scale });
                
                // 获取容器
                const container = document.getElementById(this.containerId);
                
                // 检查是否已存在canvas元素
                let canvas = container.querySelector(`#pageCanvas-${pageNum}`);
                let context;
                
                if (canvas) {
                    // 重用现有的canvas元素
                    context = canvas.getContext('2d');
                } else {
                    // 创建新的canvas元素
                    container.innerHTML = '';
                    canvas = document.createElement('canvas');
                    canvas.id = `pageCanvas-${pageNum}`;
                    container.appendChild(canvas);
                    
                    context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                }
                
                // 渲染PDF页面
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                page.render(renderContext).promise.then(() => {
                    // 渲染完PDF后，再渲染该页面的签章
                    this.renderSignaturesOnPage(pageNum, viewport, context);
                    
                    // 添加拖拽签章的事件监听（如果还没有添加）
                    if (!canvas.signatureEventHandlers) {
                        this.addSignatureDragEvents(canvas, pageNum, viewport);
                    }
                    
                    resolve();
                }).catch((error) => {
                    reject(error);
                });
            }).catch((error) => {
                reject(error);
            });
        });
    }
    
    // 渲染页面上的签章
    renderSignaturesOnPage(pageNum, viewport, context) {
        const pageSignatures = this.signatures[pageNum - 1];
        if (!pageSignatures || pageSignatures.length === 0) return;
        
        // 清空现有的签章（只清空签章区域，不重新渲染PDF）
        // 注意：这种方法可能会有问题，如果签章重叠的话
        // 更好的方法是重新渲染整个PDF页面，但这会导致性能问题
        // 所以我们只在必要时才重新渲染整个页面
        
        // 直接绘制所有签章
        pageSignatures.forEach(signature => {
            this.drawSignature(context, signature, viewport);
        });
    }
    
    // 仅更新指定页面上的签章，不重新渲染PDF
    updateSignaturesOnPage(pageNum) {
        const pageSignatures = this.signatures[pageNum - 1];
        if (!pageSignatures || pageSignatures.length === 0) return;
        
        // 获取当前页面的canvas
        const canvas = document.getElementById(`pageCanvas-${pageNum}`);
        if (!canvas) return;
        
        const context = canvas.getContext('2d');
        
        // 获取viewport（从dragState中获取或重新计算）
        let viewport;
        if (this.dragState && this.dragState.viewport) {
            viewport = this.dragState.viewport;
        } else {
            // 如果没有viewport信息，只能重新渲染整个页面
            this.renderPage(pageNum);
            return;
        }
        
        // 保存当前上下文状态
        context.save();
        
        // 计算所有签章的边界区域
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = 0;
        let maxY = 0;
        
        pageSignatures.forEach(signature => {
            const x = signature.position.x * viewport.width;
            const y = signature.position.y * viewport.height;
            const width = signature.size.width * this.scale;
            const height = signature.size.height * this.scale;
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
        });
        
        // 扩展边界，确保所有签章都被清空
        minX = Math.max(0, minX - 10);
        minY = Math.max(0, minY - 10);
        maxX = Math.min(canvas.width, maxX + 10);
        maxY = Math.min(canvas.height, maxY + 10);
        
        // 清空签章区域
        context.clearRect(minX, minY, maxX - minX, maxY - minY);
        
        // 重新渲染该区域的PDF内容
        const clipRect = { left: minX / this.scale, top: minY / this.scale, width: (maxX - minX) / this.scale, height: (maxY - minY) / this.scale };
        
        this.pdfDoc.getPage(pageNum).then((page) => {
            // 创建一个临时canvas用于渲染PDF的局部区域
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = clipRect.width;
            tempCanvas.height = clipRect.height;
            const tempContext = tempCanvas.getContext('2d');
            
            // 创建裁剪后的viewport
            const clipViewport = page.getViewport({ scale: this.scale });
            
            // 渲染PDF的局部区域
            const renderContext = {
                canvasContext: tempContext,
                viewport: clipViewport,
                transform: [1, 0, 0, 1, -clipRect.left, -clipRect.top] // 平移变换，只渲染指定区域
            };
            
            page.render(renderContext).promise.then(() => {
                // 将临时canvas的内容绘制到主canvas的指定区域
                context.drawImage(tempCanvas, minX, minY);
                
                // 绘制所有签章
                pageSignatures.forEach(signature => {
                    this.drawSignature(context, signature, viewport);
                });
                
                // 恢复上下文状态
                context.restore();
            });
        });
    }
    
    // 绘制单个签章
    drawSignature(context, signature, viewport) {
        // 计算签章在canvas上的位置和大小
        const x = signature.position.x * viewport.width;
        const y = signature.position.y * viewport.height;
        const width = signature.size.width * this.scale;
        const height = signature.size.height * this.scale;
        
        // 如果是选中的签章，绘制边框和控制点（无论图片是否加载完成，确保用户可以操作）
        if (signature === this.selectedSignature) {
            context.strokeStyle = '#007bff';
            context.lineWidth = 2;
            context.strokeRect(x, y, width, height);
            
            // 绘制调整大小的控制点
            this.drawResizeHandles(context, x, y, width, height);
            
            // 绘制删除按钮
            this.drawDeleteButton(context, x, y, width, height);
        }
        
        // 绘制签章
        const img = new Image();
        img.crossOrigin = "anonymous";
        
        img.onload = () => {
            // 保存当前上下文状态
            context.save();
            
            // 设置透明度
            context.globalAlpha = signature.opacity || 1.0;
            
            // 绘制签章（在边框和控制点之上）
            context.drawImage(img, x, y, width, height);
            
            // 恢复上下文状态
            context.restore();
        };
        img.src = signature.dataUrl;
    }
    
    // 绘制删除按钮
    drawDeleteButton(context, x, y, width, height) {
        // 删除按钮的位置和大小
        const buttonSize = 20;
        const buttonX = x + width - buttonSize;
        const buttonY = y;
        
        // 保存上下文状态
        context.save();
        
        // 设置删除按钮样式
        context.fillStyle = '#e74c3c';
        context.strokeStyle = '#c0392b';
        context.lineWidth = 1;
        
        // 绘制按钮背景
        context.fillRect(buttonX, buttonY, buttonSize, buttonSize);
        context.strokeRect(buttonX, buttonY, buttonSize, buttonSize);
        
        // 绘制删除符号（X）
        context.strokeStyle = '#ffffff';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(buttonX + 4, buttonY + 4);
        context.lineTo(buttonX + buttonSize - 4, buttonY + buttonSize - 4);
        context.moveTo(buttonX + buttonSize - 4, buttonY + 4);
        context.lineTo(buttonX + 4, buttonY + buttonSize - 4);
        context.stroke();
        
        // 恢复上下文状态
        context.restore();
    }
    
    // 绘制调整大小的控制点
    drawResizeHandles(context, x, y, width, height) {
        const handleSize = 8;
        const handles = [
            { x: x - handleSize / 2, y: y - handleSize / 2 }, // 左上角
            { x: x + width / 2 - handleSize / 2, y: y - handleSize / 2 }, // 上中
            { x: x + width - handleSize / 2, y: y - handleSize / 2 }, // 右上角
            { x: x + width - handleSize / 2, y: y + height / 2 - handleSize / 2 }, // 右中
            { x: x + width - handleSize / 2, y: y + height - handleSize / 2 }, // 右下角
            { x: x + width / 2 - handleSize / 2, y: y + height - handleSize / 2 }, // 下中
            { x: x - handleSize / 2, y: y + height - handleSize / 2 }, // 左下角
            { x: x - handleSize / 2, y: y + height / 2 - handleSize / 2 } // 左中
        ];
        
        context.fillStyle = '#007bff';
        handles.forEach(handle => {
            context.fillRect(handle.x, handle.y, handleSize, handleSize);
        });
    }
    
    // 添加拖拽签章的事件监听
    addSignatureDragEvents(canvas, pageNum, viewport) {
        // 使用类属性存储状态，确保作用域正确
        this.dragState = {
            isDragging: false,
            isResizing: false,
            currentSignature: null,
            currentPageNum: pageNum,
            offsetX: 0,
            offsetY: 0,
            resizeHandle: null,
            viewport: viewport,
            canvas: canvas
        };
        
        // 检查鼠标点击位置是否在签章上
        const getSignatureAtPosition = (x, y, pageSignatures) => {
            for (let i = pageSignatures.length - 1; i >= 0; i--) {
                const signature = pageSignatures[i];
                const sigX = signature.position.x * viewport.width;
                const sigY = signature.position.y * viewport.height;
                const sigWidth = signature.size.width * this.scale;
                const sigHeight = signature.size.height * this.scale;
                
                if (x >= sigX && x <= sigX + sigWidth && y >= sigY && y <= sigY + sigHeight) {
                    return signature;
                }
            }
            return null;
        };
        
        // 检查鼠标点击位置是否在删除按钮上
        const isClickOnDeleteButton = (x, y, signature) => {
            const sigX = signature.position.x * viewport.width;
            const sigY = signature.position.y * viewport.height;
            const sigWidth = signature.size.width * this.scale;
            const buttonSize = 20;
            const buttonX = sigX + sigWidth - buttonSize;
            const buttonY = sigY;
            
            return x >= buttonX && x <= buttonX + buttonSize && y >= buttonY && y <= buttonY + buttonSize;
        };
        
        // 检查鼠标点击位置是否在调整大小的控制点上
        const getResizeHandleAtPosition = (x, y, signature) => {
            const sigX = signature.position.x * viewport.width;
            const sigY = signature.position.y * viewport.height;
            const sigWidth = signature.size.width * this.scale;
            const sigHeight = signature.size.height * this.scale;
            const handleSize = 8;
            
            const handles = [
                { name: 'nw', rect: { x: sigX - handleSize / 2, y: sigY - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 'n', rect: { x: sigX + sigWidth / 2 - handleSize / 2, y: sigY - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 'ne', rect: { x: sigX + sigWidth - handleSize / 2, y: sigY - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 'e', rect: { x: sigX + sigWidth - handleSize / 2, y: sigY + sigHeight / 2 - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 'se', rect: { x: sigX + sigWidth - handleSize / 2, y: sigY + sigHeight - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 's', rect: { x: sigX + sigWidth / 2 - handleSize / 2, y: sigY + sigHeight - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 'sw', rect: { x: sigX - handleSize / 2, y: sigY + sigHeight - handleSize / 2, width: handleSize, height: handleSize } },
                { name: 'w', rect: { x: sigX - handleSize / 2, y: sigY + sigHeight / 2 - handleSize / 2, width: handleSize, height: handleSize } }
            ];
            
            for (const handle of handles) {
                if (x >= handle.rect.x && x <= handle.rect.x + handle.rect.width && 
                    y >= handle.rect.y && y <= handle.rect.y + handle.rect.height) {
                    return handle.name;
                }
            }
            return null;
        };
        
        // 鼠标按下事件
        const handleMouseDown = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.scale;
            const y = (e.clientY - rect.top) / this.scale;
            
            // 获取当前页面的签章
            const currentPageSignatures = this.signatures[pageNum - 1];
            
            // 检查是否点击了现有签章
            const clickedSignature = getSignatureAtPosition(x, y, currentPageSignatures);
            if (clickedSignature) {
                // 检查是否点击了删除按钮
                if (isClickOnDeleteButton(x, y, clickedSignature)) {
                    // 删除选中的签章
                    this.deleteSelectedSignature();
                } else {
                    // 检查是否点击了调整大小的控制点
                    const handle = getResizeHandleAtPosition(x, y, clickedSignature);
                    if (handle) {
                        // 开始调整大小
                        this.dragState.isResizing = true;
                        this.dragState.currentSignature = clickedSignature;
                        this.dragState.resizeHandle = handle;
                        this.dragState.offsetX = x;
                        this.dragState.offsetY = y;
                    } else {
                        // 开始拖拽
                        this.dragState.isDragging = true;
                        this.dragState.currentSignature = clickedSignature;
                        this.dragState.offsetX = x - (clickedSignature.position.x * viewport.width);
                        this.dragState.offsetY = y - (clickedSignature.position.y * viewport.height);
                    }
                    
                    // 选中当前签章
                    this.selectedSignature = clickedSignature;
                }
                
                this.updateSignaturesOnPage(pageNum);
                e.preventDefault();
                e.stopPropagation();
            } else {
                // 点击空白处，取消选择
                this.selectedSignature = null;
                this.updateSignaturesOnPage(pageNum);
            }
        };
        
        // 鼠标移动事件
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / this.scale;
            const y = (e.clientY - rect.top) / this.scale;
            
            const currentPageSignatures = this.signatures[pageNum - 1];
            
            if (this.dragState.isDragging && this.dragState.currentSignature) {
                // 更新签章位置
                const signature = this.dragState.currentSignature;
                const newPosX = (x - this.dragState.offsetX) / viewport.width;
                const newPosY = (y - this.dragState.offsetY) / viewport.height;
                
                // 计算旧位置和新位置
                const oldX = signature.position.x * viewport.width;
                const oldY = signature.position.y * viewport.height;
                const newX = newPosX * viewport.width;
                const newY = newPosY * viewport.height;
                const width = signature.size.width * this.scale;
                const height = signature.size.height * this.scale;
                
                // 更新签章位置
                signature.position.x = newPosX;
                signature.position.y = newPosY;
                
                // 直接在canvas上绘制，避免异步渲染延迟
                const context = canvas.getContext('2d');
                
                // 清空旧位置和新位置的最大边界区域
                const minX = Math.min(oldX, newX) - 10;
                const minY = Math.min(oldY, newY) - 10;
                const maxX = Math.max(oldX + width, newX + width) + 10;
                const maxY = Math.max(oldY + height, newY + height) + 10;
                
                context.clearRect(minX, minY, maxX - minX, maxY - minY);
                
                // 重新渲染该区域的PDF内容
                const clipRect = { left: minX / this.scale, top: minY / this.scale, width: (maxX - minX) / this.scale, height: (maxY - minY) / this.scale };
                
                // 使用临时canvas渲染PDF局部区域
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = clipRect.width;
                tempCanvas.height = clipRect.height;
                const tempContext = tempCanvas.getContext('2d');
                
                this.pdfDoc.getPage(pageNum).then((page) => {
                    const clipViewport = page.getViewport({ scale: this.scale });
                    const renderContext = {
                        canvasContext: tempContext,
                        viewport: clipViewport,
                        transform: [1, 0, 0, 1, -clipRect.left, -clipRect.top]
                    };
                    
                    page.render(renderContext).promise.then(() => {
                        // 将临时canvas内容绘制到主canvas
                        context.drawImage(tempCanvas, minX, minY);
                        
                        // 绘制所有签章
                        currentPageSignatures.forEach(sig => {
                            this.drawSignature(context, sig, viewport);
                        });
                    });
                });
                
                e.preventDefault();
                e.stopPropagation();
            } else if (this.dragState.isResizing && this.dragState.currentSignature) {
                // 更新签章大小
                const signature = this.dragState.currentSignature;
                const sigX = signature.position.x * viewport.width;
                const sigY = signature.position.y * viewport.height;
                let newWidth = signature.size.width;
                let newHeight = signature.size.height;
                let newPosX = signature.position.x;
                let newPosY = signature.position.y;
                
                // 根据不同的控制点调整大小
                if (this.dragState.resizeHandle.includes('e')) {
                    newWidth = Math.max(20, x - sigX) / this.scale;
                } else if (this.dragState.resizeHandle.includes('w')) {
                    newWidth = Math.max(20, sigX + signature.size.width * this.scale - x) / this.scale;
                    newPosX = (x / this.scale) / viewport.width;
                }
                
                if (this.dragState.resizeHandle.includes('s')) {
                    newHeight = Math.max(20, y - sigY) / this.scale;
                } else if (this.dragState.resizeHandle.includes('n')) {
                    newHeight = Math.max(20, sigY + signature.size.height * this.scale - y) / this.scale;
                    newPosY = (y / this.scale) / viewport.height;
                }
                
                // 处理纯水平或垂直缩放
                if (this.dragState.resizeHandle === 'n' || this.dragState.resizeHandle === 's') {
                    // 仅垂直缩放，保持宽高比
                    const aspectRatio = signature.size.originalWidth / signature.size.originalHeight;
                    newWidth = newHeight * aspectRatio;
                    
                    if (this.dragState.resizeHandle === 'n') {
                        // 顶部缩放时需要调整位置
                        newPosX = signature.position.x + (signature.size.width - newWidth) / 2 / viewport.width;
                    }
                } else if (this.dragState.resizeHandle === 'w' || this.dragState.resizeHandle === 'e') {
                    // 仅水平缩放，保持宽高比
                    const aspectRatio = signature.size.originalWidth / signature.size.originalHeight;
                    newHeight = newWidth / aspectRatio;
                    
                    if (this.dragState.resizeHandle === 'w') {
                        // 左侧缩放时需要调整位置
                        newPosY = signature.position.y + (signature.size.height - newHeight) / 2 / viewport.height;
                    }
                } else {
                    // 保持宽高比
                    const aspectRatio = signature.size.originalWidth / signature.size.originalHeight;
                    if (this.dragState.resizeHandle.includes('n') || this.dragState.resizeHandle.includes('s')) {
                        newWidth = newHeight * aspectRatio;
                    } else {
                        newHeight = newWidth / aspectRatio;
                    }
                }
                
                // 计算旧边界和新边界
                const oldX = sigX;
                const oldY = sigY;
                const oldWidth = signature.size.width * this.scale;
                const oldHeight = signature.size.height * this.scale;
                
                // 更新签章属性
                signature.size.width = newWidth;
                signature.size.height = newHeight;
                signature.position.x = newPosX;
                signature.position.y = newPosY;
                signature.scale = newWidth / signature.size.originalWidth;
                
                // 计算新边界
                const newX = newPosX * viewport.width;
                const newY = newPosY * viewport.height;
                const newWidthScaled = newWidth * this.scale;
                const newHeightScaled = newHeight * this.scale;
                
                // 清空旧边界和新边界的最大区域
                const minX = Math.min(oldX, newX) - 10;
                const minY = Math.min(oldY, newY) - 10;
                const maxX = Math.max(oldX + oldWidth, newX + newWidthScaled) + 10;
                const maxY = Math.max(oldY + oldHeight, newY + newHeightScaled) + 10;
                
                // 直接在canvas上绘制
                const context = canvas.getContext('2d');
                context.clearRect(minX, minY, maxX - minX, maxY - minY);
                
                // 重新渲染该区域的PDF内容
                const clipRect = { left: minX / this.scale, top: minY / this.scale, width: (maxX - minX) / this.scale, height: (maxY - minY) / this.scale };
                
                // 使用临时canvas渲染PDF局部区域
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = clipRect.width;
                tempCanvas.height = clipRect.height;
                const tempContext = tempCanvas.getContext('2d');
                
                this.pdfDoc.getPage(pageNum).then((page) => {
                    const clipViewport = page.getViewport({ scale: this.scale });
                    const renderContext = {
                        canvasContext: tempContext,
                        viewport: clipViewport,
                        transform: [1, 0, 0, 1, -clipRect.left, -clipRect.top]
                    };
                    
                    page.render(renderContext).promise.then(() => {
                        // 将临时canvas内容绘制到主canvas
                        context.drawImage(tempCanvas, minX, minY);
                        
                        // 绘制所有签章
                        currentPageSignatures.forEach(sig => {
                            this.drawSignature(context, sig, viewport);
                        });
                    });
                });
                
                e.preventDefault();
                e.stopPropagation();
            } else {
                // 更新鼠标样式
                const signature = getSignatureAtPosition(x, y, currentPageSignatures);
                canvas.style.cursor = signature ? 'move' : 'default';
                
                if (signature) {
                    const handle = getResizeHandleAtPosition(x, y, signature);
                    if (handle) {
                        if (handle === 'nw' || handle === 'se') canvas.style.cursor = 'nwse-resize';
                        else if (handle === 'ne' || handle === 'sw') canvas.style.cursor = 'nesw-resize';
                        else if (handle === 'n' || handle === 's') canvas.style.cursor = 'ns-resize';
                        else if (handle === 'e' || handle === 'w') canvas.style.cursor = 'ew-resize';
                    }
                }
            }
        };
        
        // 鼠标抬起事件
        const handleMouseUp = () => {
            // 保存拖拽或缩放的最终结果
            if (this.dragState.isDragging || this.dragState.isResizing) {
                // 直接重新渲染整个页面，确保没有拖影
                this.renderPage(pageNum);
            }
            
            this.dragState.isDragging = false;
            this.dragState.isResizing = false;
            this.dragState.currentSignature = null;
            this.dragState.resizeHandle = null;
        };
        
        // 鼠标离开事件
        const handleMouseLeave = () => {
            handleMouseUp();
            canvas.style.cursor = 'default';
        };
        
        // 添加事件监听器
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        
        // 保存事件处理函数引用，以便后续清理
        canvas.signatureEventHandlers = {
            mousedown: handleMouseDown,
            mousemove: handleMouseMove,
            mouseup: handleMouseUp,
            mouseleave: handleMouseLeave
        };
    }
    
    // 跳转到上一页
    goToPreviousPage() {
        if (this.currentPage > 1) {
            this.renderPage(this.currentPage - 1).then(() => {
                this.updatePageInfo();
            });
        }
    }
    
    // 跳转到下一页
    goToNextPage() {
        if (this.currentPage < this.totalPages) {
            this.renderPage(this.currentPage + 1).then(() => {
                this.updatePageInfo();
            });
        }
    }
    
    // 更新页面信息
    updatePageInfo() {
        // 更新页面信息显示
        const pageInfoEl = document.getElementById('pageInfo');
        if (pageInfoEl) {
            pageInfoEl.textContent = `第 ${this.currentPage} 页 / 共 ${this.totalPages} 页`;
        }
        
        // 更新翻页按钮的禁用状态
        const prevButton = document.getElementById('prevPage');
        const nextButton = document.getElementById('nextPage');
        
        if (prevButton) {
            prevButton.disabled = this.currentPage <= 1;
        }
        
        if (nextButton) {
            nextButton.disabled = this.currentPage >= this.totalPages;
        }
    }
    
    // 添加签章到指定页面
    addSignatureToPages(signature, pages) {
        console.log('addSignatureToPages 被调用:', { signature, pages });
        return new Promise((resolve, reject) => {
            try {
                const imagePromises = [];
                
                // 为指定页面添加签章
                pages.forEach(pageNum => {
                    console.log('处理页面:', pageNum);
                    if (pageNum >= 1 && pageNum <= this.totalPages) {
                        // 创建Image对象获取原始尺寸
                        const imgPromise = new Promise((imgResolve) => {
                            const img = new Image();
                            img.onload = () => {
                            // 改进实现：在页面中下部偏右位置添加签章，使用固定尺寸
                            // 设置固定宽度为200px，根据原始宽高比计算高度
                            const fixedWidth = 200;
                            const aspectRatio = img.height / img.width;
                            const fixedHeight = fixedWidth * aspectRatio;
                            
                            // 确保最小高度，避免签章太小
                            const minHeight = 80;
                            const finalHeight = Math.max(fixedHeight, minHeight);
                            const finalWidth = finalHeight / aspectRatio;
                            
                            const newSignature = {
                                ...signature,
                                position: { x: 0.6, y: 0.75 }, // 默认位置：中下部偏右，预留右边距
                                scale: finalWidth / img.width, // 根据固定尺寸计算缩放比例
                                size: { 
                                    width: finalWidth, 
                                    height: finalHeight,
                                    originalWidth: img.width,
                                    originalHeight: img.height
                                },
                                opacity: 1.0
                            };
                                
                                this.signatures[pageNum - 1].push(newSignature);
                                
                                // 如果是当前页面，只更新签章区域
                                if (pageNum === this.currentPage) {
                                    this.updateSignaturesOnPage(this.currentPage);
                                }
                                
                                imgResolve();
                            };
                            img.src = signature.dataUrl;
                        });
                        
                        imagePromises.push(imgPromise);
                    }
                });
                
                // 等待所有图片加载完成
                Promise.all(imagePromises).then(() => {
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }
    
    // 导出PDF
    savePdf(format = 'png') {
        return new Promise(async (resolve, reject) => {
            console.log('开始导出PDF...');
            
            // 获取当前渲染的页面
            const canvas = document.querySelector('#' + this.containerId + ' canvas');
            if (!canvas) {
                reject(new Error('未找到渲染的PDF页面'));
                return;
            }
            
            try {
                // 确保所有签名都已完全加载和绘制
                await this.ensureAllSignaturesDrawn();
                
                // 生成导出文件名（保留原始文件名）
                const baseName = this.originalFileName.replace(/\.[^/.]+$/, ""); // 移除扩展名
                const exportFileName = `${baseName}_signed_${new Date().getTime()}`;
                
                // 根据选择的格式导出
                if (format === 'png' || format === 'jpg' || format === 'jpeg') {
                    // 导出为图片
                    const mimeType = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
                    const dataUrl = canvas.toDataURL(mimeType, 0.9);
                    
                    // 下载图片
                    const link = document.createElement('a');
                    link.download = `${exportFileName}.${format}`;
                    link.href = dataUrl;
                    link.click();
                    
                    // 保存到数据库
                    if (this.dbInitialized) {
                        try {
                            const signedDocument = {
                                name: exportFileName,
                                originalName: this.originalFileName,
                                format: format,
                                dataUrl: dataUrl,
                                pageCount: this.totalPages,
                                createdAt: Date.now()
                            };
                            await this.dbService.saveSignedDocument(signedDocument);
                        } catch (dbError) {
                            console.warn('保存到数据库失败:', dbError);
                        }
                    }
                } else if (format === 'pdf') {
                    // 使用jsPDF生成真正的PDF文件
                    const { jsPDF } = window.jspdf;
                    const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'px',
                        format: 'a4'
                    });
                    
                    // 获取页面尺寸信息
                    const canvasWidth = canvas.width;
                    const canvasHeight = canvas.height;
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    
                    // 计算缩放比例以适应PDF页面
                    const scale = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
                    const scaledWidth = canvasWidth * scale;
                    const scaledHeight = canvasHeight * scale;
                    const xOffset = (pdfWidth - scaledWidth) / 2;
                    const yOffset = (pdfHeight - scaledHeight) / 2;
                    
                    // 添加当前页面到PDF
                    const dataUrl = canvas.toDataURL('image/png');
                    pdf.addImage(dataUrl, 'PNG', xOffset, yOffset, scaledWidth, scaledHeight);
                    
                    // 生成PDF数据
                    const pdfDataUrl = pdf.output('dataurlstring');
                    
                    // 下载PDF
                    const link = document.createElement('a');
                    link.download = `${exportFileName}.pdf`;
                    link.href = pdfDataUrl;
                    link.click();
                    
                    // 保存到数据库
                    if (this.dbInitialized) {
                        try {
                            const signedDocument = {
                                name: exportFileName,
                                originalName: this.originalFileName,
                                format: 'pdf',
                                dataUrl: pdfDataUrl,
                                pageCount: this.totalPages,
                                signatures: this.signatures,
                                createdAt: Date.now()
                            };
                            await this.dbService.saveSignedDocument(signedDocument);
                        } catch (dbError) {
                            console.warn('保存到数据库失败:', dbError);
                        }
                    }
                }
                
                console.log(`PDF已导出为${format}格式`);
                resolve();
            } catch (error) {
                console.error('导出PDF时出错:', error);
                reject(error);
            }
        });
    }
    
    // 确保所有签名都已完全加载和绘制
    ensureAllSignaturesDrawn() {
        return new Promise((resolve, reject) => {
            const canvas = document.querySelector('#' + this.containerId + ' canvas');
            if (!canvas) {
                resolve();
                return;
            }
            
            const context = canvas.getContext('2d');
            const currentPage = this.currentPage;
            const pageSignatures = this.signatures[currentPage - 1];
            
            if (!pageSignatures || pageSignatures.length === 0) {
                resolve();
                return;
            }
            
            // 创建一个数组来存储图片加载的Promise
            const imageLoadPromises = [];
            
            // 获取当前页面的viewport
            this.pdfDoc.getPage(currentPage).then(page => {
                const viewport = page.getViewport({ scale: this.scale });
                
                // 重新绘制所有签名，确保图片已加载
                pageSignatures.forEach(signature => {
                    imageLoadPromises.push(this.redrawSignature(context, signature, viewport));
                });
                
                // 等待所有图片加载完成
                Promise.all(imageLoadPromises).then(() => {
                    resolve();
                }).catch(error => {
                    reject(error);
                });
            }).catch(error => {
                reject(error);
            });
        });
    }
    
    // 重新绘制签名，返回Promise确保图片加载完成
    redrawSignature(context, signature, viewport) {
        return new Promise((resolve, reject) => {
            // 计算签章在canvas上的位置和大小
            const x = signature.position.x * viewport.width;
            const y = signature.position.y * viewport.height;
            const width = signature.size.width * this.scale;
            const height = signature.size.height * this.scale;
            
            // 如果是选中的签章，绘制边框和控制点
            if (signature === this.selectedSignature) {
                context.strokeStyle = '#007bff';
                context.lineWidth = 2;
                context.strokeRect(x, y, width, height);
                
                // 绘制调整大小的控制点
                this.drawResizeHandles(context, x, y, width, height);
                
                // 绘制删除按钮
                this.drawDeleteButton(context, x, y, width, height);
            }
            
            // 绘制签章图片
            const img = new Image();
            img.crossOrigin = "anonymous";
            
            img.onload = () => {
                // 保存当前上下文状态
                context.save();
                
                // 设置透明度
                context.globalAlpha = signature.opacity || 1.0;
                
                // 绘制签章
                context.drawImage(img, x, y, width, height);
                
                // 恢复上下文状态
                context.restore();
                
                resolve();
            };
            
            img.onerror = () => {
                reject(new Error('签名图片加载失败'));
            };
            
            img.src = signature.dataUrl;
        });
    }
    
    // 删除当前选中的签章
    deleteSelectedSignature() {
        if (this.selectedSignature) {
            // 遍历所有页面，找到并删除选中的签章
            for (let pageNum = 0; pageNum < this.signatures.length; pageNum++) {
                const pageSignatures = this.signatures[pageNum];
                const index = pageSignatures.indexOf(this.selectedSignature);
                
                if (index !== -1) {
                    // 删除签章
                    pageSignatures.splice(index, 1);
                    this.selectedSignature = null;
                    
                    // 更新当前页面的显示
                    if (pageNum + 1 === this.currentPage) {
                        // 如果页面上没有签章了，或者updateSignaturesOnPage无法正常工作，直接重新渲染整个页面
                        if (!pageSignatures || pageSignatures.length === 0) {
                            this.renderPage(this.currentPage);
                        } else {
                            // 先尝试使用局部更新
                            this.updateSignaturesOnPage(this.currentPage);
                            // 强制重新渲染页面，确保签章正确删除
                            this.renderPage(this.currentPage);
                        }
                    }
                    break;
                }
            }
        }
    }
    
    // 重置PDF
    reset() {
        // 清空所有签章
        this.signatures = new Array(this.totalPages).fill(null).map(() => []);
        this.selectedSignature = null;
        
        // 重新渲染当前页面
        this.renderPage(this.currentPage);
    }
}

// 导出PdfService类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PdfService;
} else if (typeof window !== 'undefined') {
    window.PdfService = PdfService;
}
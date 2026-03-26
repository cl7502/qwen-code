# CLI Agent 文档编码处理最佳实践

> **目标**：为 AI Agent 和 CLI Agent 开发者提供一套完整的文档编码处理指南，确保在各种环境下正确处理中文文件名、多语言内容和跨平台文件操作。
>
> **适用场景**：命令行工具开发、AI Agent 文件处理、跨平台文件系统操作
>
> **核心原则**：编码安全、跨平台兼容、错误优雅处理、性能优化

---

## 目录

1. [核心设计理念](#核心设计理念)
2. [文件引用系统设计](#文件引用系统设计)
3. [编码处理策略](#编码处理策略)
4. [中文文件名处理](#中文文件名处理)
5. [跨平台路径处理](#跨平台路径处理)
6. [安全机制](#安全机制)
7. [性能优化](#性能优化)
8. [错误处理最佳实践](#错误处理最佳实践)
9. [测试策略](#测试策略)
10. [代码示例](#代码示例)

---

## 核心设计理念

### 1. 编码优先原则

**原则**：所有文本处理必须明确编码，不依赖系统默认编码。

```typescript
// ❌ 错误：依赖系统默认编码
const content = fs.readFileSync(filePath);

// ✅ 正确：明确指定 UTF-8 编码
const content = fs.readFileSync(filePath, 'utf-8');
```

### 2. 跨平台兼容原则

**原则**：统一使用正斜杠 `/` 作为路径分隔符，运行时根据系统自动转换。

```typescript
// ❌ 错误：硬编码 Windows 路径分隔符
const path = `${dir}\\${file}`;

// ✅ 正确：使用 path 模块自动处理
const path = require('path');
const fullPath = path.join(dir, file);
```

### 3. 安全优先原则

**原则**：所有文件操作必须经过安全验证，防止路径遍历攻击。

```typescript
// ❌ 错误：直接使用用户输入的路径
const filePath = userInputPath;
fs.readFile(filePath);

// ✅ 正确：验证路径合法性
const safePath = resolveSafePath(userInputPath, baseDir);
if (safePath) {
  fs.readFile(safePath);
}
```

---

## 文件引用系统设计

### 1. @ 符号引用语法

**设计目标**：提供简洁、直观的文件引用方式，支持多种路径格式。

#### 支持的路径格式

| 格式     | 语法              | 示例               | 说明             |
| -------- | ----------------- | ------------------ | ---------------- |
| 同目录   | `@./file.md`      | `@./config.md`     | 引用同目录文件   |
| 父目录   | `@../file.md`     | `@../base.md`      | 引用父目录文件   |
| 子目录   | `@./dir/file.md`  | `@./config/app.md` | 引用子目录文件   |
| 绝对路径 | `@/absolute/path` | `@/etc/config.md`  | 使用绝对路径     |
| 多文件   | `@file1 @file2`   | `@a.md @b.md`      | 空格分隔多个文件 |

#### 实现要点

```typescript
// 文件引用解析器
class FileReferenceParser {
  private baseDir: string;
  private allowedDirs: string[];

  constructor(baseDir: string, allowedDirs: string[] = []) {
    this.baseDir = path.resolve(baseDir);
    this.allowedDirs = allowedDirs.map((d) => path.resolve(d));
  }

  // 解析 @ 符号引用
  parse(reference: string): string | null {
    // 移除 @ 前缀
    const cleanRef = reference.replace(/^@/, '');

    // 解析路径
    let resolvedPath: string;
    if (path.isAbsolute(cleanRef)) {
      resolvedPath = cleanRef;
    } else {
      resolvedPath = path.resolve(this.baseDir, cleanRef);
    }

    // 安全验证
    if (!this.isPathAllowed(resolvedPath)) {
      return null;
    }

    return resolvedPath;
  }

  // 安全验证：防止路径遍历
  private isPathAllowed(targetPath: string): boolean {
    const realTarget = fs.realpathSync(targetPath);

    // 检查是否在允许的目录内
    for (const allowedDir of this.allowedDirs) {
      const realAllowed = fs.realpathSync(allowedDir);
      if (realTarget.startsWith(realAllowed + path.sep)) {
        return true;
      }
    }

    // 默认允许 baseDir
    const realBase = fs.realpathSync(this.baseDir);
    return realTarget.startsWith(realBase + path.sep);
  }
}
```

### 2. 递归导入处理

**设计目标**：支持文件间的嵌套导入，同时防止循环引用。

```typescript
class FileImportResolver {
  private importStack: Set<string> = new Set();
  private maxDepth: number = 5;
  private currentDepth: number = 0;

  async resolve(filePath: string): Promise<string> {
    // 循环检测
    if (this.importStack.has(filePath)) {
      throw new Error(`循环导入检测: ${filePath}`);
    }

    // 深度限制
    if (this.currentDepth >= this.maxDepth) {
      throw new Error(`导入深度超过限制 (${this.maxDepth})`);
    }

    // 添加到导入栈
    this.importStack.add(filePath);
    this.currentDepth++;

    try {
      // 读取文件内容
      const content = await this.readFileSafe(filePath);

      // 递归处理嵌套导入
      const processedContent = await this.processImports(
        content,
        path.dirname(filePath),
      );

      return processedContent;
    } finally {
      // 清理导入栈
      this.importStack.delete(filePath);
      this.currentDepth--;
    }
  }

  // 处理内容中的导入语句
  private async processImports(
    content: string,
    currentDir: string,
  ): Promise<string> {
    const importRegex = /@([^\s]+)/g;
    let processed = content;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const reference = match[1];
      const parser = new FileReferenceParser(currentDir);
      const resolvedPath = parser.parse(reference);

      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const importedContent = await this.resolve(resolvedPath);
        processed = processed.replace(match[0], importedContent);
      }
    }

    return processed;
  }

  // 安全读取文件
  private async readFileSafe(filePath: string): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      }
      if (error.code === 'EACCES') {
        throw new Error(`无权限访问文件: ${filePath}`);
      }
      throw error;
    }
  }
}
```

---

## 编码处理策略

### 1. 文件编码检测与转换

**设计目标**：自动检测文件编码，确保正确读取各种编码的文件。

```typescript
class EncodingHandler {
  private static ENCODING_PATTERNS = {
    utf8: /^utf-?8$/i,
    gbk: /^gbk|gb2312|gb18030$/i,
    big5: /^big5$/i,
    shiftJIS: /^shift[-_]jis|sjis$/i,
  };

  // 检测文件编码
  static detectEncoding(buffer: Buffer): string {
    // 检测 BOM (Byte Order Mark)
    if (buffer.length >= 3) {
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf-8';
      }
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf-16be';
      }
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return 'utf-16le';
      }
    }

    // 尝试 UTF-8 验证
    if (this.isValidUTF8(buffer)) {
      return 'utf-8';
    }

    // 默认尝试 GBK (中文环境)
    try {
      const decoded = iconv.decode(buffer, 'gbk');
      if (!decoded.includes('�')) {
        return 'gbk';
      }
    } catch (error) {
      // GBK 解码失败，继续尝试其他编码
    }

    // 最后尝试系统默认编码
    return 'utf-8';
  }

  // 验证 UTF-8 编码
  private static isValidUTF8(buffer: Buffer): boolean {
    try {
      const decoded = buffer.toString('utf-8');
      return !decoded.includes('�');
    } catch (error) {
      return false;
    }
  }

  // 读取文件并自动检测编码
  static async readFileWithEncoding(
    filePath: string,
  ): Promise<{ content: string; encoding: string }> {
    const buffer = await fs.promises.readFile(filePath);
    const encoding = this.detectEncoding(buffer);

    let content: string;
    if (encoding === 'utf-8') {
      content = buffer.toString('utf-8');
    } else {
      // 使用 iconv-lite 处理其他编码
      const iconv = require('iconv-lite');
      content = iconv.decode(buffer, encoding);
    }

    return { content, encoding };
  }

  // 将内容转换为 UTF-8 编码
  static convertToUTF8(content: string, fromEncoding: string): Buffer {
    if (fromEncoding.toLowerCase() === 'utf-8') {
      return Buffer.from(content, 'utf-8');
    }

    const iconv = require('iconv-lite');
    const buffer = iconv.encode(content, fromEncoding);
    return iconv.decode(buffer, 'utf-8'); // 转换为 UTF-8
  }
}
```

### 2. 写入文件编码处理

**设计目标**：确保写入的文件使用正确的编码，添加必要的 BOM。

```typescript
class FileWriter {
  // 写入文件（默认 UTF-8）
  static async writeFile(
    filePath: string,
    content: string,
    options: {
      encoding?: string;
      addBOM?: boolean;
      createDirs?: boolean;
    } = {},
  ): Promise<void> {
    const { encoding = 'utf-8', addBOM = false, createDirs = true } = options;

    // 创建必要的目录
    if (createDirs) {
      await this.ensureDirectoryExists(path.dirname(filePath));
    }

    // 处理编码
    let buffer: Buffer;
    if (encoding.toLowerCase() === 'utf-8') {
      let finalContent = content;

      // 添加 UTF-8 BOM
      if (addBOM) {
        finalContent = '\uFEFF' + content;
      }

      buffer = Buffer.from(finalContent, 'utf-8');
    } else {
      // 使用 iconv-lite 处理其他编码
      const iconv = require('iconv-lite');
      buffer = iconv.encode(content, encoding);
    }

    // 写入文件
    await fs.promises.writeFile(filePath, buffer);
  }

  // 确保目录存在
  private static async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
    } catch (error) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }
}
```

---

## 中文文件名处理

### 1. 文件名编码处理

**设计目标**：正确处理中文文件名，确保在不同系统间兼容。

```typescript
class FileNameHandler {
  // 标准化文件名（处理中文和特殊字符）
  static normalizeFileName(fileName: string): string {
    // Windows 文件名限制
    const invalidChars = /[<>:"/\\|?*]/g;

    // 移除或替换无效字符
    let normalized = fileName.replace(invalidChars, '_');

    // 限制文件名长度（Windows 限制 255 字符）
    if (normalized.length > 250) {
      const ext = path.extname(normalized);
      const baseName = path.basename(normalized, ext);
      normalized = baseName.substring(0, 240) + ext;
    }

    // 处理 Windows 保留文件名
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(normalized)) {
      normalized = normalized + '_';
    }

    return normalized;
  }

  // 安全编码文件名用于 URL 或文件系统
  static encodeFileName(fileName: string): string {
    return encodeURIComponent(fileName);
  }

  // 解码文件名
  static decodeFileName(encodedFileName: string): string {
    return decodeURIComponent(encodedFileName);
  }

  // 比较文件名（考虑编码差异）
  static areFileNamesEqual(name1: string, name2: string): boolean {
    return (
      path.basename(name1).toLowerCase() === path.basename(name2).toLowerCase()
    );
  }
}
```

### 2. 中文文件搜索

**设计目标**：支持使用中文关键词搜索文件。

```typescript
class ChineseFileSearcher {
  // 使用 Unicode 正则支持中文
  private static CHINESE_PATTERN = /[\u4e00-\u9fa5]/;

  // 搜索包含中文的文件
  static async searchFiles(dir: string, keywords: string[]): Promise<string[]> {
    const results: string[] = [];
    const keywordPatterns = keywords.map((kw) => new RegExp(kw, 'gi'));

    await this.walkDirectory(dir, async (filePath) => {
      const fileName = path.basename(filePath);
      const isChineseFile = this.CHINESE_PATTERN.test(fileName);

      if (isChineseFile || this.matchesKeywords(fileName, keywordPatterns)) {
        results.push(filePath);
      }
    });

    return results;
  }

  // 检查文件名是否匹配关键词
  private static matchesKeywords(
    fileName: string,
    patterns: RegExp[],
  ): boolean {
    return patterns.some((pattern) => pattern.test(fileName));
  }

  // 递归遍历目录
  private static async walkDirectory(
    dir: string,
    callback: (filePath: string) => Promise<void>,
  ): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walkDirectory(fullPath, callback);
      } else {
        await callback(fullPath);
      }
    }
  }
}
```

---

## 跨平台路径处理

### 1. 路径标准化

**设计目标**：确保路径在不同操作系统间保持一致性。

```typescript
class PathNormalizer {
  // 标准化路径（统一使用正斜杠）
  static normalizePath(inputPath: string): string {
    // 统一路径分隔符
    let normalized = inputPath.replace(/\\/g, '/');

    // 移除重复的分隔符
    normalized = normalized.replace(/\/+/g, '/');

    // 移除末尾的分隔符（根目录除外）
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  // 转换为系统路径格式
  static toSystemPath(inputPath: string): string {
    return path.normalize(inputPath);
  }

  // 检查路径是否为绝对路径
  static isAbsolutePath(inputPath: string): boolean {
    // Unix 系统绝对路径
    if (inputPath.startsWith('/')) {
      return true;
    }

    // Windows 系统绝对路径
    if (/^[A-Za-z]:/.test(inputPath)) {
      return true;
    }

    return false;
  }

  // 计算相对路径
  static getRelativePath(from: string, to: string): string {
    const normalizedFrom = this.normalizePath(from);
    const normalizedTo = this.normalizePath(to);

    return path.relative(normalizedFrom, normalizedTo);
  }

  // 获取公共父目录
  static getCommonPath(paths: string[]): string {
    if (paths.length === 0) return '';
    if (paths.length === 1) return paths[0];

    const normalizedPaths = paths.map((p) => this.normalizePath(p).split('/'));
    const commonParts: string[] = [];

    for (let i = 0; i < normalizedPaths[0].length; i++) {
      const currentPart = normalizedPaths[0][i];
      const allMatch = normalizedPaths.every((p) => p[i] === currentPart);

      if (allMatch) {
        commonParts.push(currentPart);
      } else {
        break;
      }
    }

    return commonParts.join('/');
  }
}
```

### 2. 路径安全验证

**设计目标**：防止路径遍历攻击和非法路径访问。

```typescript
class PathSecurityValidator {
  // 验证路径安全性
  static validatePath(targetPath: string, basePath: string): {
    isValid: boolean;
    resolvedPath?: string;
    error?: string;
  } {
    try {
      // 解析为绝对路径
      const resolvedTarget = path.resolve(targetPath);
      const resolvedBase = path.resolve(basePath);

      // 检查路径是否存在
      if (!fs.existsSync(resolvedTarget)) {
        return {
          isValid: false,
          error: `路径不存在: ${targetPath}`
        };
      }

      // 检查是否在基础目录内
      const relativePath = path.relative(resolvedBase, resolvedTarget);
      if (relativePath.startsWith('..')) {
        return {
          isValid: false,
          error: `路径超出基础目录范围: ${targetPath}`
        };
      }

      // 检查文件权限
      try {
        fs.accessSync(resolvedTarget, fs.constants.R_OK);
      } catch (error) {
        return {
          isValid: false,
          error: `无权限访问: ${targetPath}`
        };
      }

      return {
        isValid: true,
        resolvedPath: resolvedTarget
      };
    } catch (error) {
      return {
        isValid: false,
        error: `路径验证失败: ${error.message}`
      };
    }
  }

  // 检查路径遍历攻击
  static hasPathTraversal(userInput: string): boolean {
    const traversalPatterns = [
      /\.\.[\/\\]/,       // ../ or ..\
      /%2e%2e%2f/i,       // URL encoded ../
      /%2e%2e\\\/i,       // URL encoded ..\
      /\.\.%2f/i,        // .URL encoded/
      /\.\.\\\/i         // ..\
    ];

    return traversalPatterns.some(pattern => pattern.test(userInput));
  }

  // 清理不安全的路径字符
  static sanitizePath(userInput: string): string {
    return userInput
      .replace(/\.\./g, '')           // 移除父目录引用
      .replace(/[<>:"|?*]/g, '')      // 移除非法字符
      .trim();
  }
}
```

---

## 安全机制

### 1. 文件访问控制

**设计目标**：实现细粒度的文件访问控制。

```typescript
class FileAccessController {
  private allowedExtensions: Set<string>;
  private deniedExtensions: Set<string>;
  private maxFileSize: number;

  constructor(
    config: {
      allowedExtensions?: string[];
      deniedExtensions?: string[];
      maxFileSize?: number;
    } = {},
  ) {
    this.allowedExtensions = new Set(config.allowedExtensions || []);
    this.deniedExtensions = new Set(
      config.deniedExtensions || [
        'exe',
        'dll',
        'bat',
        'sh',
        'cmd',
        'ps1',
        'vbs',
      ],
    );
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 默认 10MB
  }

  // 检查文件扩展名
  isAllowedExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().slice(1);

    // 检查拒绝列表
    if (this.deniedExtensions.has(ext)) {
      return false;
    }

    // 如果有允许列表，检查是否在允许列表中
    if (this.allowedExtensions.size > 0) {
      return this.allowedExtensions.has(ext);
    }

    // 默认允许
    return true;
  }

  // 检查文件大小
  async isAllowedFileSize(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.size <= this.maxFileSize;
    } catch (error) {
      return false;
    }
  }

  // 全面检查文件访问权限
  async canAccessFile(filePath: string): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // 检查扩展名
    if (!this.isAllowedExtension(filePath)) {
      return {
        allowed: false,
        reason: '文件类型不允许',
      };
    }

    // 检查文件大小
    if (!(await this.isAllowedFileSize(filePath))) {
      return {
        allowed: false,
        reason: '文件大小超过限制',
      };
    }

    // 检查文件存在性和可读性
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
      return { allowed: true };
    } catch (error) {
      return {
        allowed: false,
        reason: '文件不存在或无权限访问',
      };
    }
  }
}
```

### 2. 内容安全检查

**设计目标**：检测和处理潜在的恶意内容。

```typescript
class ContentSecurityChecker {
  // 检查危险内容模式
  private static DANGEROUS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi, // 脚本标签
    /javascript:/gi, // JavaScript 协议
    /on\w+\s*=/gi, // 事件处理器
    /<iframe[^>]*>/gi, // iframe 标签
    /eval\s*\(/gi, // eval 函数
    /document\.(write|cookie)/gi, // 危险文档操作
  ];

  // 检查文件内容安全性
  static checkContent(content: string): {
    isSafe: boolean;
    warnings: string[];
    severity: 'low' | 'medium' | 'high';
  } {
    const warnings: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    // 检查危险模式
    for (const pattern of this.DANGEROUS_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        warnings.push(`检测到潜在危险内容: ${pattern.source}`);
        severity = 'high';
      }
    }

    // 检查敏感信息
    const sensitivePatterns = [
      /password\s*[:=]\s*["']?[\w@#$%^&*]+/gi,
      /api[_-]?key\s*[:=]\s*["']?[\w-]+/gi,
      /token\s*[:=]\s*["']?[\w.-]+/gi,
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        warnings.push('可能包含敏感信息（密码、API Key 等）');
        if (severity === 'low') severity = 'medium';
      }
    }

    return {
      isSafe: warnings.length === 0,
      warnings,
      severity,
    };
  }

  // 消除危险内容
  static sanitizeContent(content: string): string {
    let sanitized = content;

    // 移除脚本标签
    sanitized = sanitized.replace(
      /<script[^>]*>.*?<\/script>/gi,
      '[脚本已移除]',
    );

    // 移除事件处理器
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

    // 移除 iframe
    sanitized = sanitized.replace(/<iframe[^>]*>/gi, '[iframe已移除]');

    // 移除危险的协议
    sanitized = sanitized.replace(/javascript:/gi, 'javascript-removed:');

    return sanitized;
  }
}
```

---

## 性能优化

### 1. 文件缓存机制

**设计目标**：减少重复文件读取，提高性能。

```typescript
class FileCache {
  private cache: Map<
    string,
    {
      content: string;
      timestamp: number;
      size: number;
    }
  > = new Map();
  private maxSize: number;
  private ttl: number;

  constructor(
    config: {
      maxSize?: number; // 最大缓存文件数
      ttl?: number; // 缓存生存时间（毫秒）
    } = {},
  ) {
    this.maxSize = config.maxSize || 100;
    this.ttl = config.ttl || 5 * 60 * 1000; // 默认 5 分钟
  }

  // 获取缓存内容
  get(filePath: string): string | null {
    const cached = this.cache.get(filePath);

    if (!cached) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(filePath);
      return null;
    }

    return cached.content;
  }

  // 设置缓存
  set(filePath: string, content: string): void {
    // 检查缓存大小限制
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(filePath, {
      content,
      timestamp: Date.now(),
      size: content.length,
    });
  }

  // 清除过期缓存
  clearExpired(): void {
    const now = Date.now();
    for (const [filePath, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.ttl) {
        this.cache.delete(filePath);
      }
    }
  }

  // 清除所有缓存
  clear(): void {
    this.cache.clear();
  }

  // 淘汰最旧的缓存
  private evictOldest(): void {
    let oldestPath: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [filePath, cached] of this.cache.entries()) {
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
        oldestPath = filePath;
      }
    }

    if (oldestPath) {
      this.cache.delete(oldestPath);
    }
  }
}
```

### 2. 批量文件处理

**设计目标**：高效处理大量文件。

```typescript
class BatchFileProcessor {
  private concurrency: number;

  constructor(concurrency: number = 5) {
    this.concurrency = concurrency;
  }

  // 批量读取文件
  async readFiles(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const chunks = this.chunkArray(filePaths, this.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map((filePath) => this.readFileSafe(filePath)),
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.set(chunk[index], result.value);
        } else {
          console.error(`读取文件失败: ${chunk[index]}`, result.reason);
        }
      });
    }

    return results;
  }

  // 批量写入文件
  async writeFiles(
    fileMap: Map<string, string>,
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const entries = Array.from(fileMap.entries());
    const chunks = this.chunkArray(entries, this.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(([filePath, content]) =>
          this.writeFileSafe(filePath, content),
        ),
      );

      chunkResults.forEach((result, index) => {
        results.set(chunk[index][0], result.status === 'fulfilled');
      });
    }

    return results;
  }

  // 安全读取单个文件
  private async readFileSafe(filePath: string): Promise<string> {
    const { content } = await EncodingHandler.readFileWithEncoding(filePath);
    return content;
  }

  // 安全写入单个文件
  private async writeFileSafe(
    filePath: string,
    content: string,
  ): Promise<void> {
    await FileWriter.writeFile(filePath, content);
  }

  // 分割数组
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

---

## 错误处理最佳实践

### 1. 错误分类和处理

**设计目标**：提供清晰的错误信息和恢复策略。

```typescript
enum FileErrorType {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ENCODING_ERROR = 'ENCODING_ERROR',
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
}

class FileError extends Error {
  constructor(
    public type: FileErrorType,
    message: string,
    public filePath?: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = 'FileError';
  }

  // 获取用户友好的错误信息
  getUserMessage(): string {
    const messages = {
      [FileErrorType.FILE_NOT_FOUND]: `文件不存在: ${this.filePath}`,
      [FileErrorType.PERMISSION_DENIED]: `无权限访问文件: ${this.filePath}`,
      [FileErrorType.ENCODING_ERROR]: `文件编码错误: ${this.filePath}`,
      [FileErrorType.PATH_TRAVERSAL]: `非法路径访问: ${this.filePath}`,
      [FileErrorType.FILE_TOO_LARGE]: `文件过大: ${this.filePath}`,
      [FileErrorType.UNSUPPORTED_FORMAT]: `不支持的文件格式: ${this.filePath}`,
      [FileErrorType.CIRCULAR_REFERENCE]: `检测到循环引用: ${this.filePath}`,
      [FileErrorType.SECURITY_VIOLATION]: `安全违规: ${this.filePath}`,
    };

    return messages[this.type] || this.message;
  }

  // 获取解决方案建议
  getSolution(): string {
    const solutions = {
      [FileErrorType.FILE_NOT_FOUND]: '请检查文件路径是否正确',
      [FileErrorType.PERMISSION_DENIED]: '请检查文件权限设置',
      [FileErrorType.ENCODING_ERROR]: '请尝试将文件转换为 UTF-8 编码',
      [FileErrorType.PATH_TRAVERSAL]: '请使用合法的文件路径',
      [FileErrorType.FILE_TOO_LARGE]: '请压缩或分割文件',
      [FileErrorType.UNSUPPORTED_FORMAT]: '请使用支持的文件格式',
      [FileErrorType.CIRCULAR_REFERENCE]: '请检查并修复循环引用',
      [FileErrorType.SECURITY_VIOLATION]: '请确保文件内容安全',
    };

    return solutions[this.type] || '请联系技术支持';
  }
}

// 错误处理器
class ErrorHandler {
  // 处理文件操作错误
  static handleFileError(error: unknown, context: string): FileError {
    if (error instanceof FileError) {
      return error;
    }

    if (error instanceof Error) {
      // 根据错误代码分类
      const errorCode = (error as NodeJS.ErrnoException).code;

      switch (errorCode) {
        case 'ENOENT':
          return new FileError(
            FileErrorType.FILE_NOT_FOUND,
            `文件不存在: ${context}`,
            context,
            error,
          );
        case 'EACCES':
          return new FileError(
            FileErrorType.PERMISSION_DENIED,
            `无权限访问: ${context}`,
            context,
            error,
          );
        case 'ENAMETOOLONG':
          return new FileError(
            FileErrorType.FILE_TOO_LARGE,
            `路径过长: ${context}`,
            context,
            error,
          );
        default:
          return new FileError(
            FileErrorType.UNSUPPORTED_FORMAT,
            `文件操作失败: ${error.message}`,
            context,
            error,
          );
      }
    }

    return new FileError(
      FileErrorType.UNSUPPORTED_FORMAT,
      `未知错误: ${String(error)}`,
      context,
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  // 记录错误日志
  static logError(
    error: FileError,
    level: 'error' | 'warn' | 'info' = 'error',
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: error.type,
      message: error.getUserMessage(),
      filePath: error.filePath,
      solution: error.getSolution(),
      stack: error.stack,
    };

    const message = `[${logEntry.timestamp}] ${logEntry.type}: ${logEntry.message}`;

    if (level === 'error') {
      console.error(message);
    } else if (level === 'warn') {
      console.warn(message);
    } else {
      console.log(message);
    }

    // 可以集成到日志系统
    // logger.log(level, logEntry);
  }
}
```

### 2. 优雅降级策略

**设计目标**：在遇到错误时提供备用方案。

```typescript
class GracefulDegradation {
  // 尝试多种编码读取文件
  static async readFileWithFallback(filePath: string): Promise<{
    content: string;
    encoding: string;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const encodings = ['utf-8', 'gbk', 'big5', 'shift_jis'];

    for (const encoding of encodings) {
      try {
        const buffer = await fs.promises.readFile(filePath);

        if (encoding === 'utf-8') {
          const content = buffer.toString('utf-8');
          if (!content.includes('�')) {
            return { content, encoding, warnings };
          }
        } else {
          const iconv = require('iconv-lite');
          const content = iconv.decode(buffer, encoding);
          if (!content.includes('�')) {
            return { content, encoding, warnings };
          }
        }

        warnings.push(`编码 ${encoding} 检测失败，尝试下一个编码`);
      } catch (error) {
        warnings.push(`编码 ${encoding} 读取失败: ${error.message}`);
      }
    }

    throw new FileError(
      FileErrorType.ENCODING_ERROR,
      `所有编码尝试失败`,
      filePath,
    );
  }

  // 尝试多个路径查找文件
  static async findFileInPaths(
    fileName: string,
    searchPaths: string[],
  ): Promise<string | null> {
    for (const searchPath of searchPaths) {
      const fullPath = path.join(searchPath, fileName);

      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  // 部分文件失败时继续处理
  static async processFilesWithPartialFailure(
    filePaths: string[],
    processor: (filePath: string) => Promise<any>,
  ): Promise<{
    successful: Map<string, any>;
    failed: Map<string, FileError>;
  }> {
    const successful = new Map<string, any>();
    const failed = new Map<string, FileError>();

    const results = await Promise.allSettled(
      filePaths.map(async (filePath) => {
        try {
          const result = await processor(filePath);
          return { filePath, result, error: null };
        } catch (error) {
          const fileError = ErrorHandler.handleFileError(error, filePath);
          return { filePath, result: null, error: fileError };
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.error) {
          failed.set(result.value.filePath, result.value.error);
        } else {
          successful.set(result.value.filePath, result.value.result);
        }
      }
    }

    return { successful, failed };
  }
}
```

---

## 测试策略

### 1. 编码测试用例

**设计目标**：确保各种编码都能正确处理。

```typescript
// 编码测试套件
describe('EncodingHandler', () => {
  const testDir = './test-encoding';

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('detectEncoding', () => {
    it('应该检测 UTF-8 编码', () => {
      const content = '你好，世界！';
      const buffer = Buffer.from(content, 'utf-8');
      const encoding = EncodingHandler.detectEncoding(buffer);
      expect(encoding).toBe('utf-8');
    });

    it('应该检测 GBK 编码', () => {
      const content = '你好，世界！';
      const iconv = require('iconv-lite');
      const buffer = iconv.encode(content, 'gbk');
      const encoding = EncodingHandler.detectEncoding(buffer);
      expect(encoding).toBe('gbk');
    });

    it('应该检测 UTF-8 BOM', () => {
      const content = '\uFEFF你好，世界！';
      const buffer = Buffer.from(content, 'utf-8');
      const encoding = EncodingHandler.detectEncoding(buffer);
      expect(encoding).toBe('utf-8');
    });
  });

  describe('readFileWithEncoding', () => {
    it('应该正确读取 UTF-8 文件', async () => {
      const filePath = path.join(testDir, 'utf8.txt');
      const content = '你好，世界！';
      fs.writeFileSync(filePath, content, 'utf-8');

      const result = await EncodingHandler.readFileWithEncoding(filePath);
      expect(result.content).toBe(content);
      expect(result.encoding).toBe('utf-8');
    });

    it('应该正确读取 GBK 文件', async () => {
      const filePath = path.join(testDir, 'gbk.txt');
      const content = '你好，世界！';
      const iconv = require('iconv-lite');
      const buffer = iconv.encode(content, 'gbk');
      fs.writeFileSync(filePath, buffer);

      const result = await EncodingHandler.readFileWithEncoding(filePath);
      expect(result.content).toBe(content);
      expect(result.encoding).toBe('gbk');
    });
  });
});
```

### 2. 中文文件名测试

```typescript
describe('FileNameHandler', () => {
  describe('normalizeFileName', () => {
    it('应该保留中文文件名', () => {
      const fileName = '测试文件.txt';
      const normalized = FileNameHandler.normalizeFileName(fileName);
      expect(normalized).toBe('测试文件.txt');
    });

    it('应该移除非法字符', () => {
      const fileName = '测试<文件>.txt';
      const normalized = FileNameHandler.normalizeFileName(fileName);
      expect(normalized).toBe('测试_文件_.txt');
    });

    it('应该处理 Windows 保留文件名', () => {
      const fileName = 'CON.txt';
      const normalized = FileNameHandler.normalizeFileName(fileName);
      expect(normalized).toBe('CON_.txt');
    });
  });

  describe('ChineseFileSearcher', () => {
    const testDir = './test-chinese-search';

    beforeAll(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      // 创建测试文件
      fs.writeFileSync(path.join(testDir, '中文文件.txt'), 'content');
      fs.writeFileSync(path.join(testDir, 'english.txt'), 'content');
    });

    afterAll(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it('应该找到包含中文的文件', async () => {
      const results = await ChineseFileSearcher.searchFiles(testDir, []);
      expect(results.some((f) => f.includes('中文文件.txt'))).toBe(true);
    });
  });
});
```

### 3. 安全测试

```typescript
describe('PathSecurityValidator', () => {
  describe('hasPathTraversal', () => {
    it('应该检测 ../ 路径遍历', () => {
      expect(
        PathSecurityValidator.hasPathTraversal('../../../etc/passwd'),
      ).toBe(true);
    });

    it('应该检测 URL 编码的路径遍历', () => {
      expect(PathSecurityValidator.hasPathTraversal('%2e%2e%2f')).toBe(true);
    });

    it('应该允许合法路径', () => {
      expect(PathSecurityValidator.hasPathTraversal('./normal/path')).toBe(
        false,
      );
    });
  });

  describe('validatePath', () => {
    const testDir = './test-security';

    beforeAll(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
    });

    afterAll(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it('应该验证合法路径', () => {
      const testFile = path.join(testDir, 'test.txt');
      fs.writeFileSync(testFile, 'content');

      const result = PathSecurityValidator.validatePath(testFile, testDir);
      expect(result.isValid).toBe(true);
    });

    it('应该拒绝路径遍历', () => {
      const maliciousPath = path.join(testDir, '../../../etc/passwd');
      const result = PathSecurityValidator.validatePath(maliciousPath, testDir);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('超出基础目录范围');
    });
  });
});
```

---

## 代码示例

### 完整的文件处理类

```typescript
/**
 * 统一的文件处理器
 * 集成了编码处理、路径安全、错误处理等功能
 */
class UnifiedFileHandler {
  private cache: FileCache;
  private accessController: FileAccessController;
  private securityValidator: PathSecurityValidator;

  constructor(
    baseDir: string,
    options: {
      cacheSize?: number;
      cacheTTL?: number;
      allowedExtensions?: string[];
      maxFileSize?: number;
    } = {},
  ) {
    this.cache = new FileCache({
      maxSize: options.cacheSize,
      ttl: options.cacheTTL,
    });

    this.accessController = new FileAccessController({
      allowedExtensions: options.allowedExtensions,
      maxFileSize: options.maxFileSize,
    });

    this.securityValidator = new PathSecurityValidator();
  }

  /**
   * 读取文件内容
   * 自动处理编码、缓存和错误
   */
  async readFile(filePath: string): Promise<string> {
    try {
      // 路径安全验证
      const validation = this.securityValidator.validatePath(
        filePath,
        process.cwd(),
      );
      if (!validation.isValid) {
        throw new FileError(
          FileErrorType.PATH_TRAVERSAL,
          validation.error,
          filePath,
        );
      }

      // 访问权限检查
      const accessCheck = await this.accessController.canAccessFile(filePath);
      if (!accessCheck.allowed) {
        throw new FileError(
          FileErrorType.PERMISSION_DENIED,
          accessCheck.reason,
          filePath,
        );
      }

      // 检查缓存
      const cached = this.cache.get(filePath);
      if (cached) {
        return cached;
      }

      // 读取文件
      const { content, encoding } =
        await EncodingHandler.readFileWithEncoding(filePath);

      // 缓存结果
      this.cache.set(filePath, content);

      return content;
    } catch (error) {
      const fileError = ErrorHandler.handleFileError(error, filePath);
      ErrorHandler.logError(fileError);
      throw fileError;
    }
  }

  /**
   * 写入文件内容
   * 自动处理编码、目录创建和错误
   */
  async writeFile(
    filePath: string,
    content: string,
    options: {
      encoding?: string;
      addBOM?: boolean;
    } = {},
  ): Promise<void> {
    try {
      // 路径安全验证
      const validation = this.securityValidator.validatePath(
        filePath,
        process.cwd(),
      );
      if (!validation.isValid) {
        throw new FileError(
          FileErrorType.PATH_TRAVERSAL,
          validation.error,
          filePath,
        );
      }

      // 写入文件
      await FileWriter.writeFile(filePath, content, {
        encoding: options.encoding || 'utf-8',
        addBOM: options.addBOM,
        createDirs: true,
      });

      // 清除缓存
      this.cache.clear();
    } catch (error) {
      const fileError = ErrorHandler.handleFileError(error, filePath);
      ErrorHandler.logError(fileError);
      throw fileError;
    }
  }

  /**
   * 处理文件引用
   * 支持 @ 符号语法
   */
  async processFileReferences(
    content: string,
    baseDir: string,
  ): Promise<string> {
    const importResolver = new FileImportResolver();
    return importResolver.processImports(content, baseDir);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// 使用示例
async function example() {
  const handler = new UnifiedFileHandler(process.cwd(), {
    cacheSize: 100,
    cacheTTL: 5 * 60 * 1000,
    maxFileSize: 10 * 1024 * 1024,
  });

  try {
    // 读取文件
    const content = await handler.readFile('./测试文件.txt');
    console.log('文件内容:', content);

    // 处理文件引用
    const processed = await handler.processFileReferences(
      content,
      process.cwd(),
    );
    console.log('处理后内容:', processed);

    // 写入文件
    await handler.writeFile('./输出文件.txt', processed, {
      encoding: 'utf-8',
      addBOM: true,
    });
  } catch (error) {
    console.error('文件处理失败:', error.getUserMessage());
    console.error('解决方案:', error.getSolution());
  }
}
```

### CLI 命令行集成示例

```typescript
#!/usr/bin/env node

import { UnifiedFileHandler } from './UnifiedFileHandler';

/**
 * 文件处理 CLI 工具
 */
class FileProcessorCLI {
  private handler: UnifiedFileHandler;

  constructor() {
    this.handler = new UnifiedFileHandler(process.cwd());
  }

  /**
   * 处理文件读取命令
   */
  async readCommand(filePath: string): Promise<void> {
    try {
      console.log(`读取文件: ${filePath}`);
      const content = await this.handler.readFile(filePath);
      console.log(content);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 处理文件写入命令
   */
  async writeCommand(filePath: string, content: string): Promise<void> {
    try {
      console.log(`写入文件: ${filePath}`);
      await this.handler.writeFile(filePath, content);
      console.log('写入成功');
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 处理文件引用命令
   */
  async referenceCommand(inputPath: string, outputPath: string): Promise<void> {
    try {
      console.log(`处理文件引用: ${inputPath}`);
      const content = await this.handler.readFile(inputPath);
      const processed = await this.handler.processFileReferences(
        content,
        path.dirname(inputPath),
      );
      await this.handler.writeFile(outputPath, processed);
      console.log(`处理完成，输出到: ${outputPath}`);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 错误处理
   */
  private handleError(error: FileError): void {
    console.error(`\n❌ ${error.getUserMessage()}`);
    console.error(`\n💡 建议解决方案: ${error.getSolution()}`);

    if (error.originalError) {
      console.error(`\n📋 详细错误信息: ${error.originalError.message}`);
    }

    process.exit(1);
  }
}

// 命令行接口
async function main() {
  const args = process.argv.slice(2);
  const cli = new FileProcessorCLI();

  if (args.length === 0) {
    console.log(`
文件处理 CLI 工具

用法:
  iflow-file read <文件路径>           - 读取文件内容
  iflow-file write <文件路径> <内容>   - 写入文件内容
  iflow-file reference <输入文件> <输出文件> - 处理文件引用

示例:
  iflow-file read ./测试文件.txt
  iflow-file write ./输出.txt "你好，世界"
  iflow-file reference ./输入.md ./输出.md
    `);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'read':
      if (args.length < 2) {
        console.error('请指定文件路径');
        process.exit(1);
      }
      await cli.readCommand(args[1]);
      break;

    case 'write':
      if (args.length < 3) {
        console.error('请指定文件路径和内容');
        process.exit(1);
      }
      await cli.writeCommand(args[1], args[2]);
      break;

    case 'reference':
      if (args.length < 3) {
        console.error('请指定输入文件和输出文件');
        process.exit(1);
      }
      await cli.referenceCommand(args[1], args[2]);
      break;

    default:
      console.error(`未知命令: ${command}`);
      process.exit(1);
  }
}

// 启动 CLI
if (require.main === module) {
  main().catch((error) => {
    console.error('程序异常:', error);
    process.exit(1);
  });
}

export { FileProcessorCLI };
```

---

## 总结

### 核心要点

1. **编码处理**
   - 明确指定 UTF-8 编码，不依赖系统默认值
   - 自动检测和处理多种编码格式
   - 支持 BOM 标记和编码转换

2. **中文支持**
   - 正确处理中文文件名和路径
   - 支持中文内容搜索和匹配
   - 提供中文友好的错误信息

3. **跨平台兼容**
   - 使用 `path` 模块处理路径
   - 统一路径分隔符处理
   - 适配不同操作系统的文件系统

4. **安全机制**
   - 路径遍历防护
   - 文件访问控制
   - 内容安全检查

5. **性能优化**
   - 文件缓存机制
   - 批量处理支持
   - 并发控制

6. **错误处理**
   - 详细的错误分类
   - 用户友好的错误信息
   - 优雅的降级策略

### 最佳实践清单

- [ ] 所有文件操作都明确指定编码
- [ ] 使用 `path` 模块处理路径，不硬编码路径分隔符
- [ ] 实现路径安全验证，防止路径遍历攻击
- [ ] 提供中文友好的错误信息和解决方案
- [ ] 实现文件缓存机制提高性能
- [ ] 编写全面的测试用例，包括编码和安全测试
- [ ] 提供优雅的错误处理和降级策略
- [ ] 支持批量操作和并发控制
- [ ] 实现日志记录和调试支持
- [ ] 遵循 DRY 原则，避免代码重复

### 快速开始

1. 安装依赖：

```bash
npm install iconv-lite
```

2. 复制核心类到项目中：

```bash
# EncodingHandler
# FileWriter
# FileReferenceParser
# FileImportResolver
# PathSecurityValidator
# FileAccessController
# ErrorHandler
# UnifiedFileHandler
```

3. 使用统一文件处理器：

```typescript
const handler = new UnifiedFileHandler(process.cwd());
const content = await handler.readFile('./测试文件.txt');
```

---

**版本**: 1.0.0  
**更新日期**: 2026-03-26  
**适用平台**: Windows, macOS, Linux  
**适用环境**: Node.js 14+  
**作者**: iFlow CLI 开发团队  
**许可**: MIT License

# CLI 应用文件操作核心工作指南

> **目标**：为 CLI 应用开发者提供一套完整的文件操作、编码处理、跨平台兼容的实践指南，基于 iFlow CLI 的设计理念和最佳实践。
>
> **核心价值**：高效、精准、不受编码影响、跨平台兼容的文件操作能力
>
> **适用场景**：CLI 工具开发、AI Agent 文件处理、开发工具构建

---

## 目录

1. [设计理念](#设计理念)
2. [文件读取策略](#文件读取策略)
3. [编码处理方案](#编码处理方案)
4. [跨平台兼容性](#跨平台兼容性)
5. [文件搜索与定位](#文件搜索与定位)
6. [文件修改操作](#文件修改操作)
7. [性能优化策略](#性能优化策略)
8. [iFlow CLI 的核心经验](#iflow-cli-的核心经验)
9. [工具选择与自研策略](#工具选择与自研策略)
10. [完整实现方案](#完整实现方案)

---

## 设计理念

### 核心原则

基于 iFlow CLI 的设计经验，一个优秀的 CLI 文件操作系统应该遵循以下原则：

#### 1. 编码无关原则

- **问题**：不同编码（UTF-8、GBK、Big5、Shift-JIS）会导致乱码
- **方案**：自动检测编码，统一转换为 UTF-8 处理
- **价值**：确保中文、日文、韩文等多语言内容正确显示

#### 2. 平台无关原则

- **问题**：Windows、macOS、Linux 的路径、编码、工具差异
- **方案**：使用跨平台库，运行时适配系统特性
- **价值**：一套代码，多平台运行

#### 3. 性能优先原则

- **问题**：大文件处理慢，频繁读取导致性能瓶颈
- **方案**：智能缓存、流式处理、批量操作
- **价值**：处理大文件依然流畅

#### 4. 安全第一原则

- **问题**：路径遍历攻击、文件权限问题、恶意内容
- **方案**：路径验证、权限检查、内容过滤
- **价值**：保护用户系统和数据安全

#### 5. 用户体验优先原则

- **问题**：错误信息不友好、操作不直观
- **方案**：中文友好提示、清晰错误原因、解决方案建议
- **价值**：降低用户使用门槛

---

## 文件读取策略

### 1. 智能编码检测

```typescript
/**
 * 文件编码检测器
 * 参考 iFlow CLI 的编码处理策略
 */
class EncodingDetector {
  // 常见编码的特征
  private static ENCODING_SIGNATURES = {
    'utf-8': [0xef, 0xbb, 0xbf], // UTF-8 BOM
    'utf-16be': [0xfe, 0xff], // UTF-16 BE BOM
    'utf-16le': [0xff, 0xfe], // UTF-16 LE BOM
    'utf-32be': [0x00, 0x00, 0xfe, 0xff], // UTF-32 BE BOM
    'utf-32le': [0xff, 0xfe, 0x00, 0x00], // UTF-32 LE BOM
  };

  /**
   * 检测文件编码
   * @param buffer 文件内容缓冲区
   * @returns 检测到的编码名称
   */
  static detect(buffer: Buffer): string {
    // 1. 检查 BOM (Byte Order Mark)
    const bomEncoding = this.detectByBOM(buffer);
    if (bomEncoding) {
      return bomEncoding;
    }

    // 2. 尝试 UTF-8 验证
    if (this.isValidUTF8(buffer)) {
      return 'utf-8';
    }

    // 3. 尝试常见编码（中文环境）
    const commonEncodings = ['gbk', 'gb18030', 'big5', 'shift_jis'];
    for (const encoding of commonEncodings) {
      if (this.testEncoding(buffer, encoding)) {
        return encoding;
      }
    }

    // 4. 默认返回 UTF-8
    return 'utf-8';
  }

  /**
   * 通过 BOM 检测编码
   */
  private static detectByBOM(buffer: Buffer): string | null {
    for (const [encoding, signature] of Object.entries(
      this.ENCODING_SIGNATURES,
    )) {
      if (buffer.length >= signature.length) {
        let match = true;
        for (let i = 0; i < signature.length; i++) {
          if (buffer[i] !== signature[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          return encoding;
        }
      }
    }
    return null;
  }

  /**
   * 验证 UTF-8 编码
   */
  private static isValidUTF8(buffer: Buffer): boolean {
    try {
      const decoded = buffer.toString('utf-8');
      // 检查是否有无效字符（替换字符）
      return !decoded.includes('\uFFFD');
    } catch {
      return false;
    }
  }

  /**
   * 测试特定编码
   */
  private static testEncoding(buffer: Buffer, encoding: string): boolean {
    try {
      const iconv = require('iconv-lite');
      const decoded = iconv.decode(buffer, encoding);
      // 检查解码后的内容是否包含大量替换字符
      const replacementCharCount = (decoded.match(/�/g) || []).length;
      const replacementRatio = replacementCharCount / decoded.length;
      return replacementRatio < 0.1; // 替换字符少于 10% 认为是正确编码
    } catch {
      return false;
    }
  }
}
```

### 2. 智能文件读取器

```typescript
/**
 * 智能文件读取器
 * 支持大文件流式读取、编码检测、多种文件格式
 */
class SmartFileReader {
  private maxMemorySize: number; // 内存读取的最大文件大小
  private defaultEncoding: string;

  constructor(
    options: {
      maxMemorySize?: number; // 默认 10MB
      defaultEncoding?: string; // 默认 utf-8
    } = {},
  ) {
    this.maxMemorySize = options.maxMemorySize || 10 * 1024 * 1024;
    this.defaultEncoding = options.defaultEncoding || 'utf-8';
  }

  /**
   * 读取文件（自动选择策略）
   */
  async readFile(filePath: string): Promise<string> {
    // 1. 检查文件是否存在
    await this.validateFile(filePath);

    // 2. 获取文件大小
    const stats = await fs.promises.stat(filePath);

    // 3. 根据文件大小选择读取策略
    if (stats.size <= this.maxMemorySize) {
      return await this.readToMemory(filePath);
    } else {
      return await this.readAsStream(filePath);
    }
  }

  /**
   * 读取到内存（小文件）
   */
  private async readToMemory(filePath: string): Promise<string> {
    const buffer = await fs.promises.readFile(filePath);
    const encoding = EncodingDetector.detect(buffer);

    if (encoding === 'utf-8') {
      return buffer.toString('utf-8');
    } else {
      const iconv = require('iconv-lite');
      return iconv.decode(buffer, encoding);
    }
  }

  /**
   * 流式读取（大文件）
   */
  private async readAsStream(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = fs.createReadStream(filePath, {
        highWaterMark: 64 * 1024,
      }); // 64KB chunks

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const encoding = EncodingDetector.detect(buffer);

        let content: string;
        if (encoding === 'utf-8') {
          content = buffer.toString('utf-8');
        } else {
          const iconv = require('iconv-lite');
          content = iconv.decode(buffer, encoding);
        }

        resolve(content);
      });

      stream.on('error', reject);
    });
  }

  /**
   * 验证文件
   */
  private async validateFile(filePath: string): Promise<void> {
    try {
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`文件不存在: ${filePath}`);
      } else if (error.code === 'EACCES') {
        throw new Error(`无权限读取文件: ${filePath}`);
      }
      throw error;
    }
  }

  /**
   * 读取特定行范围（用于大文件的局部读取）
   */
  async readLines(
    filePath: string,
    startLine: number,
    endLine: number,
  ): Promise<string> {
    const content = await this.readFile(filePath);
    const lines = content.split('\n');
    const selectedLines = lines.slice(startLine - 1, endLine);
    return selectedLines.join('\n');
  }
}
```

---

## 编码处理方案

### 1. 统一编码处理

```typescript
/**
 * 统一编码处理器
 * 参考 iFlow CLI 的中文处理经验
 */
class UnifiedEncodingHandler {
  private targetEncoding: string;

  constructor(targetEncoding: string = 'utf-8') {
    this.targetEncoding = targetEncoding;
  }

  /**
   * 将文本转换为目标编码
   */
  convert(text: string, fromEncoding?: string): Buffer {
    if (!fromEncoding || fromEncoding.toLowerCase() === this.targetEncoding) {
      return Buffer.from(text, this.targetEncoding);
    }

    const iconv = require('iconv-lite');
    const buffer = iconv.encode(text, fromEncoding);
    return iconv.decode(buffer, this.targetEncoding);
  }

  /**
   * 处理中文文件名
   */
  normalizeFileName(fileName: string): string {
    // 移除非法字符
    const normalized = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();

    // 处理 Windows 保留文件名
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    if (reservedNames.test(normalized)) {
      return normalized + '_';
    }

    // 限制长度
    if (normalized.length > 250) {
      const ext = path.extname(normalized);
      const baseName = path.basename(normalized, ext);
      return baseName.substring(0, 240) + ext;
    }

    return normalized;
  }

  /**
   * 处理路径中的中文
   */
  normalizePath(inputPath: string): string {
    // 统一路径分隔符
    let normalized = inputPath.replace(/\\/g, '/');

    // 移除重复分隔符
    normalized = normalized.replace(/\/+/g, '/');

    // URL 编码中文部分（用于某些场景）
    const parts = normalized.split('/');
    const encodedParts = parts.map((part) => {
      if (/[\u4e00-\u9fa5]/.test(part)) {
        return encodeURIComponent(part);
      }
      return part;
    });

    return encodedParts.join('/');
  }

  /**
   * 验证中文内容是否完整
   */
  validateChineseContent(content: string): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const chinesePattern = /[\u4e00-\u9fa5]/;

    // 检查是否有中断的中文（可能由编码错误导致）
    const matches = content.match(chinesePattern);
    if (matches && matches.length > 0) {
      // 检查是否有孤立的中文（前后没有其他字符）
      const isolatedChinese = content.match(
        /[^\u4e00-\u9fa5]*[\u4e00-\u9fa5][^\u4e00-\u9fa5]*/g,
      );
      if (isolatedChinese) {
        isolatedChinese.forEach((match) => {
          if (match.length === 1) {
            issues.push(`可能的孤立中文字符: ${match}`);
          }
        });
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}
```

### 2. 多语言内容支持

```typescript
/**
 * 多语言内容处理器
 * 支持中文、日文、韩文等多语言内容
 */
class MultiLanguageHandler {
  private static LANGUAGE_PATTERNS = {
    chinese: /[\u4e00-\u9fa5]/,
    japanese: /[\u3040-\u309f\u30a0-\u30ff]/,
    korean: /[\uac00-\ud7af]/,
    latin: /[a-zA-Z]/,
    numbers: /[0-9]/,
  };

  /**
   * 检测内容语言
   */
  detectLanguage(content: string): string[] {
    const detectedLanguages: string[] = [];

    for (const [language, pattern] of Object.entries(this.LANGUAGE_PATTERNS)) {
      if (pattern.test(content)) {
        detectedLanguages.push(language);
      }
    }

    return detectedLanguages;
  }

  /**
   * 统计语言分布
   */
  analyzeLanguageDistribution(content: string): Map<string, number> {
    const distribution = new Map<string, number>();
    const totalChars = content.length;

    for (const [language, pattern] of Object.entries(this.LANGUAGE_PATTERNS)) {
      const matches = content.match(new RegExp(pattern.source, 'g'));
      const count = matches ? matches.length : 0;
      const percentage = (count / totalChars) * 100;

      if (percentage > 0) {
        distribution.set(language, Math.round(percentage * 100) / 100);
      }
    }

    return distribution;
  }

  /**
   * 智能分割（考虑语言边界）
   */
  smartSplit(content: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const isCJK =
        /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(char);

      if (currentChunk.length + (isCJK ? 1 : 1) > maxLength) {
        chunks.push(currentChunk);
        currentChunk = char;
      } else {
        currentChunk += char;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
```

---

## 跨平台兼容性

### 1. 操作系统检测与适配

```typescript
/**
 * 操作系统适配器
 * 参考 iFlow CLI 的跨平台处理策略
 */
class OSAdapter {
  private static platform: NodeJS.Platform = process.platform;
  private static arch: string = process.arch;

  /**
   * 获取当前操作系统信息
   */
  static getOSInfo(): {
    platform: NodeJS.Platform;
    arch: string;
    isWindows: boolean;
    isMacOS: boolean;
    isLinux: boolean;
  } {
    return {
      platform: this.platform,
      arch: this.arch,
      isWindows: this.platform === 'win32',
      isMacOS: this.platform === 'darwin',
      isLinux: this.platform === 'linux',
    };
  }

  /**
   * 获取路径分隔符
   */
  static getPathSeparator(): string {
    return this.platform === 'win32' ? '\\' : '/';
  }

  /**
   * 标准化路径（跨平台）
   */
  static normalizePath(inputPath: string): string {
    // 统一使用正斜杠（内部处理）
    let normalized = inputPath.replace(/\\/g, '/');

    // 移除重复分隔符
    normalized = normalized.replace(/\/+/g, '/');

    // 移除末尾分隔符（根目录除外）
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * 转换为系统路径格式
   */
  static toSystemPath(inputPath: string): string {
    if (this.platform === 'win32') {
      return inputPath.replace(/\//g, '\\');
    }
    return inputPath;
  }

  /**
   * 检查命令是否可用
   */
  static async isCommandAvailable(command: string): Promise<boolean> {
    try {
      if (this.platform === 'win32') {
        await this.exec(`where.exe ${command}`);
      } else {
        await this.exec(`which ${command}`);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 执行系统命令（跨平台）
   */
  static async exec(command: string, options?: any): Promise<string> {
    const { execSync } = require('child_process');

    try {
      const output = execSync(command, {
        encoding: 'utf-8',
        ...options,
      });
      return output.trim();
    } catch (error) {
      throw new Error(`命令执行失败: ${command}`);
    }
  }

  /**
   * 获取环境变量（跨平台）
   */
  static getEnvVar(name: string): string | undefined {
    return process.env[name];
  }

  /**
   * 设置环境变量（跨平台）
   */
  static setEnvVar(name: string, value: string): void {
    process.env[name] = value;
  }

  /**
   * 获取临时目录
   */
  static getTempDir(): string {
    return require('os').tmpdir();
  }

  /**
   * 获取用户主目录
   */
  static getHomeDir(): string {
    return require('os').homedir();
  }
}
```

### 2. 跨平台工具选择

```typescript
/**
 * 跨平台工具管理器
 * 根据平台选择最佳工具
 */
class CrossPlatformToolManager {
  private static toolCache: Map<string, boolean> = new Map();

  /**
   * 选择最佳文件搜索工具
   */
  static async getBestFileSearchTool(): Promise<'find' | 'ripgrep' | 'glob'> {
    // 优先级：ripgrep > find > glob
    if (await this.isToolAvailable('rg')) {
      return 'ripgrep';
    }
    if (await this.isToolAvailable('find')) {
      return 'find';
    }
    return 'glob';
  }

  /**
   * 选择最佳文件读取工具
   */
  static getBestFileReader(): string {
    // Node.js fs 模块是跨平台的最佳选择
    return 'fs';
  }

  /**
   * 选择最佳文本编辑器
   */
  static async getBestEditor(): Promise<string> {
    const editors = [
      'code', // VS Code
      'vim', // Vim
      'nano', // Nano
      'notepad', // Windows Notepad
      'gedit', // Linux Gedit
    ];

    for (const editor of editors) {
      if (await this.isToolAvailable(editor)) {
        return editor;
      }
    }

    return 'vi'; // 最后的备选
  }

  /**
   * 检查工具是否可用
   */
  private static async isToolAvailable(tool: string): Promise<boolean> {
    if (this.toolCache.has(tool)) {
      return this.toolCache.get(tool)!;
    }

    const available = await OSAdapter.isCommandAvailable(tool);
    this.toolCache.set(tool, available);
    return available;
  }

  /**
   * 获取平台特定的配置
   */
  static getPlatformConfig(): {
    lineEnding: string;
    pathSeparator: string;
    envVarPrefix: string;
    shell: string;
  } {
    const isWindows = OSAdapter.getOSInfo().isWindows;

    return {
      lineEnding: isWindows ? '\r\n' : '\n',
      pathSeparator: isWindows ? ';' : ':',
      envVarPrefix: isWindows ? '%' : '$',
      shell: isWindows ? 'cmd.exe' : '/bin/bash',
    };
  }
}
```

---

## 文件搜索与定位

### 1. 高效文件搜索

```typescript
/**
 * 高效文件搜索器
 * 参考 iFlow CLI 的文件搜索策略
 */
class EfficientFileSearcher {
  private useRipGrep: boolean = false;
  private useFind: boolean = false;

  constructor() {
    this.initializeTools();
  }

  /**
   * 初始化可用工具
   */
  private async initializeTools(): Promise<void> {
    this.useRipGrep = await OSAdapter.isCommandAvailable('rg');
    this.useFind = await OSAdapter.isCommandAvailable('find');
  }

  /**
   * 搜索文件（自动选择最佳工具）
   */
  async searchFiles(
    searchPath: string,
    pattern: string,
    options: {
      recursive?: boolean;
      caseSensitive?: boolean;
      filePattern?: string;
      maxResults?: number;
    } = {},
  ): Promise<string[]> {
    const {
      recursive = true,
      caseSensitive = false,
      filePattern = '*',
      maxResults = 1000,
    } = options;

    // 优先使用 ripgrep
    if (this.useRipGrep) {
      return await this.searchWithRipGrep(searchPath, pattern, {
        recursive,
        caseSensitive,
        filePattern,
        maxResults,
      });
    }

    // 其次使用 find
    if (this.useFind) {
      return await this.searchWithFind(searchPath, pattern, {
        recursive,
        caseSensitive,
        filePattern,
        maxResults,
      });
    }

    // 最后使用 glob
    return await this.searchWithGlob(searchPath, pattern, {
      recursive,
      caseSensitive,
      filePattern,
      maxResults,
    });
  }

  /**
   * 使用 ripgrep 搜索
   */
  private async searchWithRipGrep(
    searchPath: string,
    pattern: string,
    options: any,
  ): Promise<string[]> {
    const args = ['--files-with-matches', pattern, searchPath];

    if (!options.caseSensitive) {
      args.push('-i');
    }

    if (options.filePattern) {
      args.push('--glob', options.filePattern);
    }

    try {
      const output = await OSAdapter.exec(`rg ${args.join(' ')}`);
      return output.split('\n').filter(Boolean).slice(0, options.maxResults);
    } catch (error) {
      return [];
    }
  }

  /**
   * 使用 find 搜索
   */
  private async searchWithFind(
    searchPath: string,
    pattern: string,
    options: any,
  ): Promise<string[]> {
    const args = [
      searchPath,
      options.recursive ? '' : '-maxdepth 1',
      '-type',
      'f',
      '-name',
      options.filePattern || '*',
    ].filter(Boolean);

    try {
      const output = await OSAdapter.exec(`find ${args.join(' ')}`);
      const files = output.split('\n').filter(Boolean);

      // 使用 grep 过滤内容
      const grepArgs = options.caseSensitive ? [] : ['-i'];
      const matchingFiles: string[] = [];

      for (const file of files) {
        try {
          await OSAdapter.exec(
            `grep ${grepArgs.join(' ')} "${pattern}" "${file}"`,
          );
          matchingFiles.push(file);
          if (matchingFiles.length >= options.maxResults) break;
        } catch {
          // 文件不匹配
        }
      }

      return matchingFiles;
    } catch (error) {
      return [];
    }
  }

  /**
   * 使用 glob 搜索
   */
  private async searchWithGlob(
    searchPath: string,
    pattern: string,
    options: any,
  ): Promise<string[]> {
    const glob = require('glob');
    const globPattern = options.recursive
      ? `${searchPath}/**/${options.filePattern || '*'}`
      : `${searchPath}/${options.filePattern || '*'}`;

    return new Promise((resolve) => {
      glob(globPattern, (err: Error | null, files: string[]) => {
        if (err) {
          resolve([]);
          return;
        }

        // 读取文件内容进行匹配
        const matchingFiles: string[] = [];
        let processedCount = 0;

        files.forEach((file) => {
          fs.readFile(file, 'utf-8', (readErr, content) => {
            processedCount++;

            if (!readErr) {
              const regex = new RegExp(
                pattern,
                options.caseSensitive ? 'g' : 'gi',
              );
              if (regex.test(content)) {
                matchingFiles.push(file);
              }
            }

            if (
              processedCount === files.length ||
              matchingFiles.length >= options.maxResults
            ) {
              resolve(matchingFiles.slice(0, options.maxResults));
            }
          });
        });
      });
    });
  }
}
```

### 2. 精准内容定位

```typescript
/**
 * 精准内容定位器
 * 支持行号、列号、上下文定位
 */
class PreciseContentLocator {
  /**
   * 定位内容位置
   */
  locate(
    content: string,
    pattern: string | RegExp,
    options: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
      nth?: number; // 第 N 个匹配
    } = {},
  ): Array<{
    line: number;
    column: number;
    match: string;
    before: string;
    after: string;
  }> {
    const { caseSensitive = false, wholeWord = false, nth = 0 } = options;

    const regex = this.buildRegex(pattern, { caseSensitive, wholeWord });
    const lines = content.split('\n');
    const results: any[] = [];
    let matchCount = 0;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let match: RegExpExecArray | null;

      while ((match = regex.exec(line)) !== null) {
        if (matchCount === nth) {
          results.push({
            line: lineNum + 1,
            column: match.index + 1,
            match: match[0],
            before: line.substring(0, match.index),
            after: line.substring(match.index + match[0].length),
          });
          break;
        }
        matchCount++;
      }

      if (results.length > 0) {
        break;
      }
    }

    return results;
  }

  /**
   * 获取上下文
   */
  getContext(
    content: string,
    lineNum: number,
    contextLines: number = 3,
  ): {
    before: string[];
    target: string;
    after: string[];
  } {
    const lines = content.split('\n');
    const targetLine = lines[lineNum - 1];

    const before = lines.slice(
      Math.max(0, lineNum - 1 - contextLines),
      lineNum - 1,
    );

    const after = lines.slice(
      lineNum,
      Math.min(lines.length, lineNum + contextLines),
    );

    return {
      before,
      target: targetLine,
      after,
    };
  }

  /**
   * 构建正则表达式
   */
  private buildRegex(
    pattern: string | RegExp,
    options: {
      caseSensitive?: boolean;
      wholeWord?: boolean;
    },
  ): RegExp {
    let regexStr: string;
    let flags: string = options.caseSensitive ? 'g' : 'gi';

    if (pattern instanceof RegExp) {
      regexStr = pattern.source;
      flags += pattern.flags;
    } else {
      regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    if (options.wholeWord) {
      regexStr = `\\b${regexStr}\\b`;
    }

    return new RegExp(regexStr, flags);
  }
}
```

---

## 文件修改操作

### 1. 智能文件修改器

```typescript
/**
 * 智能文件修改器
 * 参考 iFlow CLI 的文件操作策略
 */
class SmartFileModifier {
  private reader: SmartFileReader;
  private encodingHandler: UnifiedEncodingHandler;

  constructor() {
    this.reader = new SmartFileReader();
    this.encodingHandler = new UnifiedEncodingHandler();
  }

  /**
   * 替换文件内容
   */
  async replace(
    filePath: string,
    oldText: string | RegExp,
    newText: string,
    options: {
      caseSensitive?: boolean;
      global?: boolean;
      backup?: boolean;
    } = {},
  ): Promise<number> {
    const { caseSensitive = false, global = true, backup = true } = options;

    // 读取文件
    const content = await this.reader.readFile(filePath);

    // 创建备份
    if (backup) {
      await this.createBackup(filePath);
    }

    // 构建正则表达式
    const regex = this.buildRegex(oldText, { caseSensitive, global });

    // 执行替换
    const newContent = content.replace(regex, newText);

    // 写入文件
    await this.writeFile(filePath, newContent);

    // 返回替换次数
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * 追加内容
   */
  async append(
    filePath: string,
    content: string,
    options: {
      newLine?: boolean;
      encoding?: string;
    } = {},
  ): Promise<void> {
    const { newLine = true, encoding = 'utf-8' } = options;

    let appendContent = content;
    if (newLine) {
      appendContent = '\n' + content;
    }

    await fs.promises.appendFile(filePath, appendContent, encoding);
  }

  /**
   * 插入内容（指定位置）
   */
  async insert(
    filePath: string,
    content: string,
    position: {
      line: number;
      column?: number;
    },
    options: {
      after?: boolean;
      backup?: boolean;
    } = {},
  ): Promise<void> {
    const { after = false, backup = true } = options;

    // 读取文件
    const fileContent = await this.reader.readFile(filePath);
    const lines = fileContent.split('\n');

    // 创建备份
    if (backup) {
      await this.createBackup(filePath);
    }

    // 插入内容
    const targetLine = position.line - 1;
    if (after) {
      lines.splice(targetLine + 1, 0, content);
    } else {
      const targetLineContent = lines[targetLine];
      const insertPos = position.column ? position.column - 1 : 0;
      lines[targetLine] =
        targetLineContent.substring(0, insertPos) +
        content +
        targetLineContent.substring(insertPos);
    }

    // 写入文件
    await this.writeFile(filePath, lines.join('\n'));
  }

  /**
   * 创建备份
   */
  private async createBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.backup`;
    await fs.promises.copyFile(filePath, backupPath);
  }

  /**
   * 写入文件
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 构建正则表达式
   */
  private buildRegex(
    pattern: string | RegExp,
    options: {
      caseSensitive?: boolean;
      global?: boolean;
    },
  ): RegExp {
    let regexStr: string;
    let flags: string = options.caseSensitive ? '' : 'i';
    if (options.global) flags += 'g';

    if (pattern instanceof RegExp) {
      regexStr = pattern.source;
      flags += pattern.flags;
    } else {
      regexStr = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    return new RegExp(regexStr, flags);
  }
}
```

### 2. 批量文件操作

```typescript
/**
 * 批量文件操作器
 * 支持高效的批量处理
 */
class BatchFileOperator {
  private concurrency: number;

  constructor(concurrency: number = 5) {
    this.concurrency = concurrency;
  }

  /**
   * 批量替换
   */
  async batchReplace(
    filePaths: string[],
    oldText: string | RegExp,
    newText: string,
    options: {
      caseSensitive?: boolean;
      global?: boolean;
      backup?: boolean;
    } = {},
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const chunks = this.chunkArray(filePaths, this.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map((filePath) =>
          this.replaceFile(filePath, oldText, newText, options),
        ),
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.set(chunk[index], result.value);
        } else {
          console.error(`处理文件失败: ${chunk[index]}`, result.reason);
        }
      });
    }

    return results;
  }

  /**
   * 批量创建
   */
  async batchCreate(files: Map<string, string>): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const entries = Array.from(files.entries());
    const chunks = this.chunkArray(entries, this.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(([filePath, content]) => this.createFile(filePath, content)),
      );

      chunkResults.forEach((result, index) => {
        results.set(chunk[index][0], result.status === 'fulfilled');
      });
    }

    return results;
  }

  /**
   * 替换单个文件
   */
  private async replaceFile(
    filePath: string,
    oldText: string | RegExp,
    newText: string,
    options: any,
  ): Promise<number> {
    const modifier = new SmartFileModifier();
    return await modifier.replace(filePath, oldText, newText, options);
  }

  /**
   * 创建单个文件
   */
  private async createFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 分割数组
   */
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

## 性能优化策略

### 1. 智能缓存系统

```typescript
/**
 * 智能缓存系统
 * 参考 iFlow CLI 的性能优化策略
 */
class IntelligentCache {
  private cache: Map<string, CacheEntry>;
  private maxSize: number;
  private ttl: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(
    options: {
      maxSize?: number;
      ttl?: number;
    } = {},
  ) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100;
    this.ttl = options.ttl || 5 * 60 * 1000; // 默认 5 分钟
  }

  /**
   * 获取缓存
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  /**
   * 设置缓存
   */
  set(key: string, value: any): void {
    // 检查缓存大小
    if (this.cache.size >= this.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccess: Date.now(),
      size: JSON.stringify(value).length,
    });
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * 淘汰最久未使用的缓存
   */
  private evict(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

interface CacheEntry {
  value: any;
  timestamp: number;
  lastAccess: number;
  size: number;
}
```

### 2. 流式大文件处理

```typescript
/**
 * 流式大文件处理器
 * 用于处理超大文件，避免内存溢出
 */
class StreamingFileProcessor {
  private chunkSize: number;

  constructor(chunkSize: number = 64 * 1024) {
    this.chunkSize = chunkSize;
  }

  /**
   * 流式搜索
   */
  async streamSearch(
    filePath: string,
    pattern: string | RegExp,
    callback: (match: { line: number; content: string }) => void,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      let lineNumber = 1;
      let matchCount = 0;
      let buffer = '';

      const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const regex =
        pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');

      stream.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (regex.test(line)) {
            matchCount++;
            callback({ line: lineNumber, content: line });
          }
          lineNumber++;
        }
      });

      stream.on('end', () => {
        // 处理最后一行
        if (buffer && regex.test(buffer)) {
          matchCount++;
          callback({ line: lineNumber, content: buffer });
        }
        resolve(matchCount);
      });

      stream.on('error', reject);
    });
  }

  /**
   * 流式替换
   */
  async streamReplace(
    inputPath: string,
    outputPath: string,
    pattern: string | RegExp,
    replacement: string,
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      let matchCount = 0;
      const regex =
        pattern instanceof RegExp ? pattern : new RegExp(pattern, 'g');

      const inputStream = fs.createReadStream(inputPath, { encoding: 'utf-8' });
      const outputStream = fs.createWriteStream(outputPath, {
        encoding: 'utf-8',
      });

      let buffer = '';

      inputStream.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (let line of lines) {
          const matches = line.match(regex);
          if (matches) {
            matchCount += matches.length;
          }
          const replacedLine = line.replace(regex, replacement);
          outputStream.write(replacedLine + '\n');
        }
      });

      inputStream.on('end', () => {
        if (buffer) {
          const matches = buffer.match(regex);
          if (matches) {
            matchCount += matches.length;
          }
          const replacedLine = buffer.replace(regex, replacement);
          outputStream.write(replacedLine);
        }
        outputStream.end();
        resolve(matchCount);
      });

      inputStream.on('error', reject);
      outputStream.on('error', reject);
    });
  }
}
```

---

## iFlow CLI 的核心经验

### 1. 中文处理优化

基于 iFlow CLI 的变更日志和文档，以下是关键经验：

#### 版本迭代中的中文支持改进

```typescript
/**
 * iFlow CLI 中文处理经验总结
 */
class iFlowChineseExperience {
  /**
   * 关键经验点
   */
  static readonly LESSONS = {
    // v0.2.36: 解决 Shell 输出信息错误和中文乱码问题
    ENCODING_DETECTION: {
      issue: 'Shell 输出中文乱码',
      solution: '统一使用 UTF-8 编码处理输出',
      implementation: 'process.stdout.setEncoding("utf-8")',
    },

    // v0.2.27: 修复中文导致的异常退出问题
    ERROR_HANDLING: {
      issue: '中文路径或内容导致程序崩溃',
      solution: '增强错误处理和编码验证',
      implementation: '使用 iconv-lite 处理多编码',
    },

    // v0.2.26: 更好地适配中文的输入输出
    I18N_SUPPORT: {
      issue: '中文用户体验不佳',
      solution: '实现国际化支持',
      implementation: '自动检测终端语言，提供中文界面',
    },
  };

  /**
   * 应用 iFlow CLI 的中文处理策略
   */
  static applyChineseHandling(content: string): {
    processed: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    let processed = content;

    // 1. 检测编码问题
    if (content.includes('�')) {
      warnings.push('检测到可能的编码问题（替换字符）');
    }

    // 2. 验证中文完整性
    const chineseValidation =
      new UnifiedEncodingHandler().validateChineseContent(content);
    if (!chineseValidation.isValid) {
      warnings.push(...chineseValidation.issues);
    }

    // 3. 标准化换行符
    processed = processed.replace(/\r\n/g, '\n');

    // 4. 移除 BOM
    if (processed.charCodeAt(0) === 0xfeff) {
      processed = processed.slice(1);
    }

    return {
      processed,
      warnings,
    };
  }
}
```

### 2. 文件引用系统 (@ 符号)

```typescript
/**
 * iFlow CLI 文件引用系统实现
 */
class iFlowFileReferenceSystem {
  /**
   * 解析 @ 符号引用
   */
  static parseReferences(
    content: string,
    basePath: string,
  ): Array<{
    reference: string;
    resolvedPath: string | null;
    error?: string;
  }> {
    const referencePattern = /@([^\s]+)/g;
    const results: any[] = [];
    let match;

    while ((match = referencePattern.exec(content)) !== null) {
      const reference = match[1];
      const resolvedPath = this.resolvePath(reference, basePath);

      if (!resolvedPath) {
        results.push({
          reference,
          resolvedPath: null,
          error: '路径解析失败或文件不存在',
        });
      } else {
        results.push({
          reference,
          resolvedPath,
        });
      }
    }

    return results;
  }

  /**
   * 解析路径
   */
  private static resolvePath(
    reference: string,
    basePath: string,
  ): string | null {
    try {
      const fullPath = path.isAbsolute(reference)
        ? reference
        : path.resolve(basePath, reference);

      // 安全验证
      if (fullPath.includes('..')) {
        return null;
      }

      // 检查文件是否存在
      if (!fs.existsSync(fullPath)) {
        return null;
      }

      return fullPath;
    } catch {
      return null;
    }
  }

  /**
   * 递归处理引用
   */
  static async processReferences(
    content: string,
    basePath: string,
    maxDepth: number = 5,
    currentDepth: number = 0,
  ): Promise<string> {
    if (currentDepth >= maxDepth) {
      throw new Error('引用深度超过限制');
    }

    const references = this.parseReferences(content, basePath);
    let processed = content;

    for (const ref of references) {
      if (ref.resolvedPath) {
        const refContent = await fs.promises.readFile(
          ref.resolvedPath,
          'utf-8',
        );
        const processedRefContent = await this.processReferences(
          refContent,
          path.dirname(ref.resolvedPath),
          maxDepth,
          currentDepth + 1,
        );
        processed = processed.replace(`@${ref.reference}`, processedRefContent);
      }
    }

    return processed;
  }
}
```

### 3. 忽略文件机制

```typescript
/**
 * iFlow CLI 忽略文件系统
 */
class iFlowIgnoreSystem {
  private ignorePatterns: string[] = [];

  /**
   * 加载 .iflowignore 文件
   */
  static async loadIgnoreFile(projectPath: string): Promise<iFlowIgnoreSystem> {
    const ignoreFilePath = path.join(projectPath, '.iflowignore');
    const system = new iFlowIgnoreSystem();

    if (fs.existsSync(ignoreFilePath)) {
      const content = await fs.promises.readFile(ignoreFilePath, 'utf-8');
      system.ignorePatterns = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    }

    return system;
  }

  /**
   * 检查文件是否被忽略
   */
  isIgnored(filePath: string): boolean {
    const fileName = path.basename(filePath);
    const relativePath = path.relative(process.cwd(), filePath);

    for (const pattern of this.ignorePatterns) {
      if (
        this.matchPattern(relativePath, pattern) ||
        this.matchPattern(fileName, pattern)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 匹配模式
   */
  private matchPattern(text: string, pattern: string): boolean {
    // 转换 glob 模式为正则表达式
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(text);
  }
}
```

---

## 工具选择与自研策略

### 1. 工具选择决策树

```typescript
/**
 * 工具选择决策系统
 * 参考 iFlow CLI 的工具选择策略
 */
class ToolSelectionStrategy {
  /**
   * 文件搜索工具选择
   */
  static selectFileSearchTool(): {
    tool: string;
    reason: string;
    fallback?: string;
  } {
    // 优先级：ripgrep > find > glob
    if (OSAdapter.isCommandAvailable('rg')) {
      return {
        tool: 'ripgrep',
        reason: '性能最优，支持正则表达式，中文搜索良好'
      };
    }

    if (OSAdapter.isCommandAvailable('find')) {
      return {
        tool: 'find',
        reason: 'Unix 系统标准工具，可靠性强',
        fallback: 'glob'
      };
    }

    return {
      tool: 'glob',
      reason: '纯 JavaScript 实现，无外部依赖'
    };
  }

  /**
   * 编码处理工具选择
   */
  static selectEncodingTool(): {
    tool: string;
    reason: string;
  } {
    // iconv-lite 是 Node.js 环境的最佳选择
    return {
      tool: 'iconv-lite',
      reason: '纯 JavaScript 实现，支持多种编码，性能优秀'
    };
  }

  /**
   * 文件操作工具选择
   */
  static selectFileOperationTool(): {
    tool: string;
    reason: string;
  } {
    // Node.js fs 模块是跨平台的最佳选择
    return {
      tool: 'fs (Node.js)',
      reason: '官方模块，跨平台支持完善，性能优秀'
    };
  }

  /**
   * 自研工具场景
   */
  static shouldBuildCustomTool(scenario: string): {
    shouldBuild: boolean;
    reason: string;
  }? {
    const customScenarios = {
      'chinese-search': {
        shouldBuild: true,
        reason: '现有工具对中文搜索支持不足，需要优化'
      },
      'large-file-processing': {
        shouldBuild: true,
        reason: '需要流式处理和内存优化，现有工具不够高效'
      },
      'cross-platform-path': {
        shouldBuild: true,
        reason: '需要统一路径处理逻辑，处理平台差异'
      },
      'encoding-detection': {
        shouldBuild: true,
        reason: '需要更准确的编码检测算法'
      }
    };

    return customScenarios[scenario as keyof typeof customScenarios];
  }
}
```

### 2. 自研工具实现

```typescript
/**
 * 自研中文搜索引擎
 * 针对 iFlow CLI 的中文搜索需求优化
 */
class CustomChineseSearchEngine {
  /**
   * 构建中文索引
   */
  static buildChineseIndex(content: string): Map<string, number[]> {
    const index = new Map<string, number[]>();
    const chinesePattern = /[\u4e00-\u9fa5]/g;
    let match;

    while ((match = chinesePattern.exec(content)) !== null) {
      const char = match[0];
      const position = match.index;

      if (!index.has(char)) {
        index.set(char, []);
      }
      index.get(char)!.push(position);
    }

    return index;
  }

  /**
   * 中文短语搜索
   */
  static searchChinesePhrase(
    content: string,
    phrase: string,
  ): Array<{
    position: number;
    context: string;
  }> {
    const results: any[] = [];
    const index = this.buildChineseIndex(content);

    // 查找第一个字符的位置
    const firstChar = phrase[0];
    const positions = index.get(firstChar) || [];

    for (const pos of positions) {
      const candidate = content.substring(pos, pos + phrase.length);

      if (candidate === phrase) {
        results.push({
          position: pos,
          context: this.getContext(content, pos, phrase.length),
        });
      }
    }

    return results;
  }

  /**
   * 获取上下文
   */
  private static getContext(
    content: string,
    position: number,
    length: number,
    contextSize: number = 20,
  ): string {
    const start = Math.max(0, position - contextSize);
    const end = Math.min(content.length, position + length + contextSize);
    return content.substring(start, end);
  }
}
```

---

## 完整实现方案

### 统一文件操作接口

```typescript
/**
 * 统一文件操作接口
 * 整合所有功能，提供一致的 API
 */
class UnifiedFileOperator {
  private reader: SmartFileReader;
  private modifier: SmartFileModifier;
  private searcher: EfficientFileSearcher;
  private locator: PreciseContentLocator;
  private cache: IntelligentCache;
  private encodingHandler: UnifiedEncodingHandler;
  private osAdapter: OSAdapter;

  constructor() {
    this.reader = new SmartFileReader();
    this.modifier = new SmartFileModifier();
    this.searcher = new EfficientFileSearcher();
    this.locator = new PreciseContentLocator();
    this.cache = new IntelligentCache();
    this.encodingHandler = new UnifiedEncodingHandler();
    this.osAdapter = OSAdapter;
  }

  /**
   * 读取文件
   */
  async readFile(filePath: string): Promise<string> {
    const cacheKey = `read:${filePath}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const content = await this.reader.readFile(filePath);
    this.cache.set(cacheKey, content);

    return content;
  }

  /**
   * 搜索文件
   */
  async searchFiles(
    searchPath: string,
    pattern: string,
    options?: any,
  ): Promise<string[]> {
    return await this.searcher.searchFiles(searchPath, pattern, options);
  }

  /**
   * 替换内容
   */
  async replace(
    filePath: string,
    oldText: string | RegExp,
    newText: string,
    options?: any,
  ): Promise<number> {
    const result = await this.modifier.replace(
      filePath,
      oldText,
      newText,
      options,
    );

    // 清除缓存
    this.cache.clear();

    return result;
  }

  /**
   * 追加内容
   */
  async append(
    filePath: string,
    content: string,
    options?: any,
  ): Promise<void> {
    await this.modifier.append(filePath, content, options);
    this.cache.clear();
  }

  /**
   * 插入内容
   */
  async insert(
    filePath: string,
    content: string,
    position: { line: number; column?: number },
    options?: any,
  ): Promise<void> {
    await this.modifier.insert(filePath, content, position, options);
    this.cache.clear();
  }

  /**
   * 定位内容
   */
  locateContent(
    content: string,
    pattern: string | RegExp,
    options?: any,
  ): any[] {
    return this.locator.locate(content, pattern, options);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): any {
    return this.cache.getStats();
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
  const operator = new UnifiedFileOperator();

  try {
    // 读取文件
    const content = await operator.readFile('./测试文件.txt');
    console.log('文件内容:', content);

    // 搜索文件
    const files = await operator.searchFiles('./src', 'function');
    console.log('找到的文件:', files);

    // 替换内容
    const count = await operator.replace('./src/app.js', 'old', 'new');
    console.log('替换次数:', count);

    // 追加内容
    await operator.append('./log.txt', '新的日志条目');

    // 插入内容
    await operator.insert('./config.json', '{\n  "new": true\n}', {
      line: 1,
      column: 1,
    });

    // 定位内容
    const locations = operator.locateContent(content, '测试');
    console.log('内容位置:', locations);

    // 查看缓存统计
    const stats = operator.getCacheStats();
    console.log('缓存统计:', stats);
  } catch (error) {
    console.error('操作失败:', error);
  }
}
```

---

## 总结

### 核心要点

基于 iFlow CLI 的经验，一个优秀的 CLI 文件操作系统应该具备：

1. **编码处理**
   - 自动检测编码
   - 统一 UTF-8 处理
   - 支持中文、日文、韩文

2. **跨平台兼容**
   - 自动适配操作系统
   - 统一路径处理
   - 工具自动选择

3. **性能优化**
   - 智能缓存
   - 流式处理
   - 批量操作

4. **安全机制**
   - 路径验证
   - 权限检查
   - 备份机制

5. **用户体验**
   - 中文友好
   - 错误提示清晰
   - 操作简单直观

### 实施建议

1. **优先使用成熟库**
   - `iconv-lite` 用于编码处理
   - `glob` 用于文件匹配
   - Node.js `fs` 模块用于文件操作

2. **按需自研工具**
   - 中文搜索优化
   - 大文件流式处理
   - 特定场景优化

3. **充分测试**
   - 多语言内容测试
   - 跨平台测试
   - 大文件性能测试

4. **持续优化**
   - 监控性能指标
   - 收集用户反馈
   - 迭代改进

---

**版本**: 1.0.0  
**更新日期**: 2026-03-26  
**适用平台**: Windows, macOS, Linux  
**适用环境**: Node.js 14+  
**基于**: iFlow CLI 设计理念和最佳实践  
**许可**: MIT License

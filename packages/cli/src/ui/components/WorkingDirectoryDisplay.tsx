/**
 * @license
 * Copyright 2025 Qwen Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { getGitBranch, isGitRepository } from '@qwen-code/qwen-code-core';

interface WorkingDirectoryDisplayProps {
  cwd: string;
}

export const WorkingDirectoryDisplay: React.FC<
  WorkingDirectoryDisplayProps
> = ({ cwd }) => {
  const [branchName, setBranchName] = useState<string | undefined>(undefined);
  const [isGitRepo, setIsGitRepo] = useState<boolean>(false);

  const fetchGitInfo = useCallback(async () => {
    try {
      const gitRepo = isGitRepository(cwd);
      setIsGitRepo(gitRepo);

      if (gitRepo) {
        const branch = getGitBranch(cwd);
        setBranchName(branch);
      } else {
        setBranchName(undefined);
      }
    } catch (_error) {
      setIsGitRepo(false);
      setBranchName(undefined);
    }
  }, [cwd]);

  useEffect(() => {
    fetchGitInfo();
  }, [fetchGitInfo]);

  // 格式化路径：在 Windows 上将反斜杠转换为正斜杠，缩短路径显示
  const formatPath = (path: string): string => {
    // 在 Windows 上将反斜杠转换为正斜杠
    let formatted = path.replace(/\\/g, '/');

    // 如果路径太长，尝试缩短
    const maxLength = 50;
    if (formatted.length > maxLength) {
      const parts = formatted.split('/');
      if (parts.length > 2) {
        // 保留开头和结尾，中间用 ... 连接
        const start = parts[0];
        const end = parts.slice(-2).join('/');
        formatted = `${start}/.../${end}`;
      }
    }

    return formatted;
  };

  return (
    <Box marginLeft={2} marginTop={0}>
      <Text color={theme.text.secondary}>
        cwd: {formatPath(cwd)}
        {isGitRepo && branchName && ` (${branchName})`}
      </Text>
    </Box>
  );
};

/**
 * @license
 * Copyright 2025 Qwen Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { WorkingDirectoryDisplay } from './WorkingDirectoryDisplay.js';
import { getGitBranch, isGitRepository } from '@qwen-code/qwen-code-core';

vi.mock('@qwen-code/qwen-code-core', async () => {
  const actual = await vi.importActual('@qwen-code/qwen-code-core');
  return {
    ...actual,
    getGitBranch: vi.fn(),
    isGitRepository: vi.fn(),
  };
});

describe('WorkingDirectoryDisplay', () => {
  it('displays current working directory without git branch', () => {
    vi.mocked(isGitRepository).mockReturnValue(false);
    vi.mocked(getGitBranch).mockReturnValue(undefined);

    const { lastFrame } = render(
      <WorkingDirectoryDisplay cwd="/home/user/project" />,
    );

    expect(lastFrame()).toContain('cwd: /home/user/project');
    expect(lastFrame()).not.toContain('(');
  });

  it('displays current working directory with git branch', () => {
    vi.mocked(isGitRepository).mockReturnValue(true);
    vi.mocked(getGitBranch).mockReturnValue('main');

    const { lastFrame } = render(
      <WorkingDirectoryDisplay cwd="/home/user/project" />,
    );

    expect(lastFrame()).toContain('cwd: /home/user/project');
    expect(lastFrame()).toContain('(main)');
  });

  it('displays current working directory with git branch and asterisk', () => {
    vi.mocked(isGitRepository).mockReturnValue(true);
    vi.mocked(getGitBranch).mockReturnValue('main*');

    const { lastFrame } = render(
      <WorkingDirectoryDisplay cwd="/home/user/project" />,
    );

    expect(lastFrame()).toContain('cwd: /home/user/project');
    expect(lastFrame()).toContain('(main*)');
  });

  it('handles Windows paths correctly', () => {
    vi.mocked(isGitRepository).mockReturnValue(false);
    vi.mocked(getGitBranch).mockReturnValue(undefined);

    const { lastFrame } = render(
      <WorkingDirectoryDisplay cwd="C:\\Users\\user\\project" />,
    );

    expect(lastFrame()).toContain('cwd: C:/Users/user/project');
  });

  it('shortens long paths', () => {
    vi.mocked(isGitRepository).mockReturnValue(false);
    vi.mocked(getGitBranch).mockReturnValue(undefined);

    const longPath =
      '/very/long/path/that/needs/to/be/shortened/because/it/is/too/long';
    const { lastFrame } = render(<WorkingDirectoryDisplay cwd={longPath} />);

    expect(lastFrame()).toContain('cwd:');
    expect(lastFrame()).toContain('...');
  });
});

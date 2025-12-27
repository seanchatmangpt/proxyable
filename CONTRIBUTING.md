# Contributing to Proxyable

We appreciate your interest in contributing to Proxyable! This document provides guidelines for contributing to the project.

## Code of Conduct

Please review our [Code of Conduct](./CODE_OF_CONDUCT.md) to understand our community standards.

## How to Contribute

### Reporting Issues

If you encounter a bug or have a feature request:

1. **Check existing issues** - Before opening a new issue, search to see if someone has already reported it
2. **Provide details** - Include:
   - A clear description of the issue or request
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Your environment (OS, Node version, package version)
   - Code examples if applicable

### Submitting Changes

1. **Fork the repository** - Create your own fork of the project
2. **Create a feature branch** - `git checkout -b feat/your-feature-name`
3. **Make your changes** - Follow the code style guidelines below
4. **Write tests** - Add tests for new functionality
5. **Ensure tests pass** - Run `pnpm test` to verify everything works
6. **Commit with clear messages** - Use descriptive commit messages
7. **Push your changes** - `git push origin feat/your-feature-name`
8. **Open a pull request** - Provide a clear description of your changes

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/unjs/proxyable.git
cd proxyable

# Install dependencies
pnpm install

# Run the development environment
pnpm dev
```

### Available Scripts

```bash
# Run tests with coverage
pnpm test

# Run linting
pnpm lint

# Fix linting errors
pnpm lint:fix

# Build the project
pnpm build

# Type checking
pnpm test:types

# Start the playground
pnpm play
```

## Code Style Guidelines

### TypeScript/JavaScript

- Use ES modules (`import`/`export`)
- Follow the ESLint configuration (automatically enforced with `pnpm lint`)
- Use Prettier for code formatting (automatically enforced with `pnpm lint`)
- Use meaningful variable and function names
- Write comments for non-obvious logic

### Best Practices

- Keep functions small and focused
- Avoid deep nesting
- Handle errors appropriately
- Add TypeScript types where applicable
- Follow the existing code patterns in the project

### Example Code Style

```javascript
//  Good
import { createProxy } from './index.js';

export function setupValidation(target) {
  const { proxy, defineSetInterceptor } = createProxy(target);

  defineSetInterceptor((target, prop, value) => {
    if (!isValid(prop, value)) {
      throw new ValidationError(`Invalid ${prop}: ${value}`);
    }
    target[prop] = value;
    return true;
  });

  return proxy;
}

// L Bad
import createProxy from './index.js';
export const setupValidation = (t) => { const {proxy: p, defineSetInterceptor: d} = createProxy(t); d((t,p,v) => { if (!isValid(p,v)) throw new Error(`Invalid`); t[p]=v; return true; }); return p; };
```

## Testing Guidelines

- Write tests for all new features
- Ensure all tests pass: `pnpm test`
- Maintain or improve code coverage
- Use descriptive test names that explain what is being tested
- Test both success and failure cases

Example test structure:

```javascript
import { describe, it, expect } from 'vitest';
import { createProxy } from '../src/index.js';

describe('feature name', () => {
  it('should do something specific', () => {
    const target = { value: 0 };
    const { proxy } = createProxy(target);

    expect(proxy.value).toBe(0);
  });

  it('should throw on invalid input', () => {
    expect(() => {
      // test code
    }).toThrow();
  });
});
```

## Documentation

- Keep documentation updated with code changes
- Write clear, beginner-friendly examples
- Update API documentation in `/docs/api.md` for API changes
- Add examples to `/docs/examples.md` for new features
- Ensure all code examples work correctly

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add support for computed properties
fix: correct context isolation issue
docs: update API reference
test: add tests for new interceptor
chore: update dependencies
refactor: simplify trap execution logic
```

## Pull Request Process

1. Ensure your PR title is descriptive
2. Provide context about what your PR does
3. Reference any related issues (e.g., "Closes #123")
4. Wait for code review feedback
5. Make requested changes and push updates
6. Once approved, your PR will be merged

## Release Process

Releases are handled by maintainers using:

```bash
pnpm release
```

This will:
- Run tests
- Generate changelog
- Bump version
- Publish to npm
- Create git tags

## Questions?

If you have questions:
- Open a discussion issue
- Check existing documentation in `/docs`
- Read through existing tests for examples

## License

By contributing to Proxyable, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be acknowledged in:
- The project README
- Release notes
- Commit history

Thank you for contributing!

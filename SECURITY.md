# Security Policy

## Supported Versions

This project maintains security updates for the following versions:

| Version | Supported          | Notes                          |
|---------|--------------------|--------------------------------|
| 1.x     | :white_check_mark: | Latest version - Actively supported |
| 0.x     | :x:                | No longer supported            |

We recommend users always upgrade to the latest stable version to ensure they have the latest security patches and bug fixes.

## Reporting a Security Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.** Responsible disclosure ensures we can address security issues before they become public knowledge and impact users.

### How to Report

If you discover a security vulnerability in this project, please report it via email to the maintainers at **security@proxyable.dev**.

Include the following information in your report:
- A clear description of the vulnerability
- Steps to reproduce the issue (if applicable)
- Affected versions
- Potential impact or severity
- Your contact information (email and/or PGP key for secure communication)

### Secure Communication

For sensitive communications, you may encrypt your report using the maintainer's PGP key. Please contact us for the public key if needed.

## Security Response Timeline

We are committed to addressing security vulnerabilities promptly:

1. **Acknowledgment** (within 24-48 hours): We will acknowledge receipt of your vulnerability report
2. **Investigation** (1-7 days): Our team will investigate and validate the vulnerability
3. **Fix Development** (varies): We will develop and test a fix appropriate to the severity
4. **Patch Release** (within 30 days for critical issues): We will release a patched version
5. **Public Disclosure** (up to 90 days): After a patch is released, we may publish details about the vulnerability

### Severity Levels

- **Critical**: Remote code execution, authentication bypass, or data breach. Target fix within 7 days.
- **High**: Significant security impact requiring prompt attention. Target fix within 14 days.
- **Medium**: Moderate security impact. Target fix within 30 days.
- **Low**: Minor security issue with limited impact. May be included in regular release cycles.

## Responsible Disclosure Policy

This project follows the principle of responsible disclosure to protect users while addressing security issues fairly.

### Our Commitment

- We will treat security researchers with respect and gratitude
- We will work transparently with researchers throughout the process
- We will not pursue legal action against researchers who act in good faith
- We will keep researchers informed of our progress

### Your Commitment

- You will not publicly disclose the vulnerability before we have released a patch
- You will provide us reasonable time (up to 90 days) to develop and release a fix
- You will not exploit the vulnerability maliciously or access data beyond what is necessary to demonstrate the issue
- You will not disrupt service or damage infrastructure

### Safe Harbor

We recognize that security researchers sometimes need to test vulnerabilities in controlled environments. Provided you act according to this responsible disclosure policy and the law, we will not pursue legal action against you.

## Patch Release Process

Once a security patch is ready:

1. **Patch Version**: We will release a new patch version (following semantic versioning)
2. **Security Advisory**: We will publish a security advisory on GitHub
3. **Documentation**: We will document the fix and provide upgrade guidance
4. **Credit**: The researcher will be credited (unless they prefer anonymity)

## Credit and Acknowledgment

We are grateful for security researchers and community members who responsibly disclose vulnerabilities and help us keep this project secure.

### Hall of Honor

We maintain a list of security researchers who have responsibly disclosed vulnerabilities:

- *To be updated as vulnerabilities are reported*

### Attribution

Security researchers who report valid vulnerabilities will be credited in:
- The security advisory on GitHub
- The release notes for the patched version
- Our Hall of Honor section (unless they prefer anonymity)

If you would like to remain anonymous, please note this in your report.

## Security Best Practices

### For Users

- Keep your dependencies up to date
- Review security advisories regularly
- Monitor GitHub notifications for security updates
- Report any suspicious activity or potential vulnerabilities

### For Contributors

- Follow secure coding practices
- Use dependency management tools to identify vulnerabilities
- Run security linters and static analysis tools
- Review code changes for security implications
- Keep dependencies updated in development

## Contact

For security concerns, contact the maintainers at **security@proxyable.dev**.

For general inquiries, use the standard issue tracker on GitHub.

---

**Last Updated**: December 2025

**Next Review**: June 2026

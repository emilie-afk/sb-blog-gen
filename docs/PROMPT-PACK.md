# Prompt pack

The article instructions are not in this repository. They are kept in a private, versioned prompt
pack that is signed and stored on the server. The functions verify the signature and load the pack
before any generation; if the pack is missing or invalid, generation is refused rather than falling
back to built-in text.

The repository keeps the generic prompt-assembly code and a synthetic test pack with placeholder
text (`tests/support/test-pack.js`). Editorial regression suites run against the real pack outside
this repository. Procedures for importing, signing, activating and rolling back the pack are in the
team's private operator documentation.

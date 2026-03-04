// Shim: ensure tweetnacl is available as a global `nacl` in every context.
// tweetnacl.min.js uses:  module.exports ? module.exports : self.nacl = ...
// In some Safari background contexts a `module` global may exist, causing nacl
// to be written to module.exports instead of self.nacl.  This shim runs AFTER
// tweetnacl and copies the reference so the rest of the code can use bare `nacl`.
(function () {
    if (typeof nacl !== 'undefined') return;                       // already global
    if (typeof self !== 'undefined' && self.nacl) return;          // already on self
    if (typeof module !== 'undefined' && module.exports && module.exports.secretbox) {
        self.nacl = module.exports;                                // fix: hoist from CJS
        return;
    }
    // last resort — shouldn't happen, but log loudly
    console.error('[nacl-shim] tweetnacl could not be resolved to a global.');
})();

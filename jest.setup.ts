import '@testing-library/jest-dom';

// Polyfill Blob.prototype.text() for jsdom, which does not implement it.
// The test suite reads Blob content via .text() after the export handler
// creates a Blob — this polyfill provides the same async-string API.
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function (): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

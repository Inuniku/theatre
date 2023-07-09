declare module 'blob-compare' {
  export default class blobCompare {
    /*
     * @version 1.1.0
     * @since   1.0.0
     * @param   {Blob}  b1                First blob
     * @param   {Blob}  b2                Second blob
     * @param   {Object}  [options]   Configuration to use when performing comparison
     * @param   {Array}   [options.methods=['size', 'type', 'magic', 'byte']] Default methods used for comparison. Methods are applied in the same order
     * @param   {String}  [options.byte='buffer']   If set to `buffer`, byte comparison will be based on arraybuffers. Otherwise, it will use binary strings
     * @param   {Boolean} [options.partial=false]   When set to `true`, the first successful comparison method will prevent further evaluations and return true immediately
     * @param   {Array}   [options.chunks=null]      Custom sizes to use when performing a byte comparison. It really have few usage as one must ensure a regular pattern in blobs data to avoid false positive
     * @param   {Boolean} [options.worker=true]      Wether to use web workers if available
     * @return  {Promise<Boolean>}                   If `true`, blobs are equals given the used methods
     */
    static async isEqual(
      b1,
      b2,
      {
        methods = ['size', 'type', 'magic', 'byte'],
        byte = 'buffer',
        partial = false,
        chunks = null,
        worker = true,
      } = {},
    )
  }
}

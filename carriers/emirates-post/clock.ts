/** Emirates Post's clock at home: the UAE keeps one, Dubai's. */
export const EMIRATES_POST_ZONE = 'Asia/Dubai';

/**
 * Places that identify a UAE office. A foreign office or a bare postal code
 * keeps its own wall clock; neither the issuer nor the destination dates it.
 */
export const UAE_PLACE = /\b(?:Dubai|Abu[ -]+Dhabi|Sharjah|Ajman|Fujairah|Umm[ -]+Al[ -]+Quwain|Ras[ -]+Al[ -]+Khaimah)\b/i;

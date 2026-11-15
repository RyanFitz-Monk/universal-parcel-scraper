/**
 * Whether a scan's wording or place names what lets someone other than the recipient collect
 * the parcel or find its door: a PIN, an access, pickup or collection code, a door or house
 * number, a signature or the person who signed. A host can hide such a scan where people other
 * than the parcel's owner read the history, as a shared link's viewers do.
 *
 * Raw text, so accented and plain spellings are both listed. A carrier receiving the
 * parcel ("Recibido por Estafeta") and German "Firma" (a business) are not private.
 */
export function hasPrivateDeliveryDetails(description: string): boolean {
  return /\bpin\s*:|(?:access|security|pickup|collection) code|(?:door|house) (?:no\b|number)|signed (?:for )?by|signature|numero civico|firmato da|signe par|signé par|code (?:de retrait|d['’]acc[eè]s)|num[eé]ro de (?:rue|maison)|abholcode|zugangscode|hausnummer|unterschrieben von|codice (?:di ritiro|di accesso)|c[oó]digo (?:pin|secreto|de (?:recogida|retirada|retiro|acceso|acesso|entrega|seguridad|seguran[cç]a|levantamento|recolha|desbloqueo|desbloqueio|apertura|abertura))|firmad[oa] por|firma del destinatari|assinad[oa] por|assinatura|n[uú]mero (?:de (?:portal|puerta|casa|piso|vivienda|pol[ií]cia)|da (?:porta|casa))|(?:porta|puerta) n\.?\s?[º°]|n\.?\s?[º°] (?:de |da )?porta/i.test(description);
}

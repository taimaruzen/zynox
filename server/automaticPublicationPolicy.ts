// Fail-closed publication policy. Structural ZIP validity alone is insufficient
// to authorize untrusted HTML/JavaScript for public execution.
export type PublicationAssessment={
  zipVerified:boolean;
  crcVerified:boolean;
  allAssetsStaged:boolean;
  isolatedOriginVerified:boolean;
  sandboxVerified:boolean;
  contentPolicyVerified:boolean;
  abuseControlsReady:boolean;
};
export type PublicationDecision={action:'publish'|'quarantine';reasons:string[]};
export function assessAutomaticPublication(a:PublicationAssessment):PublicationDecision{
const checks:ReadonlyArray<[keyof PublicationAssessment,string]>=[
['zipVerified','ZIP構造の検証が未完了'],
['crcVerified','ファイルのCRC検証が未完了'],
['allAssetsStaged','全ファイルの非公開保存が未完了'],
['isolatedOriginVerified','ゲーム実行オリジンの隔離が未確認'],
['sandboxVerified','iframeの隔離設定が未確認'],
['contentPolicyVerified','コンテンツ安全検査が未完了'],
['abuseControlsReady','通報・公開停止の安全対策が未完了']
];
const reasons=checks.filter(([key])=>a[key]!==true).map(([,message])=>message);
return {action:reasons.length===0?'publish':'quarantine',reasons};
}

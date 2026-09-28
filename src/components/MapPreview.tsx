import { Linking, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/** 지도 안의 '카카오맵으로 열기'가 넘긴 주소만 연다 (다른 주소는 무시) */
function openKakaoMap(url: string | undefined) {
  if (url && /^https:\/\/map\.kakao\.com\//.test(url)) Linking.openURL(url).catch(() => {});
}

function onMessage(e: WebViewMessageEvent) {
  try {
    openKakaoMap(JSON.parse(e.nativeEvent.data)?.open);
  } catch {
    /* 지도 페이지가 보낸 게 아니면 무시 */
  }
}

/** 공고 위치 지도. 지도 안에서 끌어서 이동, 두 손가락으로 확대·축소할 수 있다. 왼쪽 위 버튼은 카카오맵을 연다. */
export function MapPreview({ uri, title }: { uri: string; title: string }) {
  return (
    <View style={styles.box} accessibilityLabel={`${title} 위치 지도`}>
      {/* nestedScrollEnabled: 안드로이드에서 바깥 화면 스크롤보다 지도 끌기를 먼저 받게 */}
      <WebView
        source={{ uri }}
        style={styles.web}
        scrollEnabled={false}
        nestedScrollEnabled
        onMessage={onMessage}
        onOpenWindow={(e) => openKakaoMap(e.nativeEvent.targetUrl)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 200, width: '100%' },
  web: { flex: 1, backgroundColor: 'transparent' },
});

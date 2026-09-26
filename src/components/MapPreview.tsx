import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/** 공고 위치 지도 미리보기. 화면 스크롤을 방해하지 않게 터치는 막고, 크게 보기는 지도 앱 버튼으로. */
export function MapPreview({ uri, title }: { uri: string; title: string }) {
  return (
    <View style={styles.box} pointerEvents="none" accessibilityLabel={`${title} 위치 지도`}>
      <WebView source={{ uri }} style={styles.web} scrollEnabled={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 200, width: '100%' },
  web: { flex: 1, backgroundColor: 'transparent' },
});

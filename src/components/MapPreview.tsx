import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/** 공고 위치 지도. 지도 안에서 끌어서 이동, 두 손가락으로 확대·축소할 수 있다. */
export function MapPreview({ uri, title }: { uri: string; title: string }) {
  return (
    <View style={styles.box} accessibilityLabel={`${title} 위치 지도`}>
      {/* nestedScrollEnabled: 안드로이드에서 바깥 화면 스크롤보다 지도 끌기를 먼저 받게 */}
      <WebView source={{ uri }} style={styles.web} scrollEnabled={false} nestedScrollEnabled />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 200, width: '100%' },
  web: { flex: 1, backgroundColor: 'transparent' },
});

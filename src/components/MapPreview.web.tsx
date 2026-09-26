import { createElement } from 'react';
import { StyleSheet, View } from 'react-native';

const HEIGHT = 200;

/** 웹 미리보기용: WebView 대신 iframe. 지도는 처음 크기 기준으로 가운데를 잡으므로 높이를 px로 못박는다. */
export function MapPreview({ uri, title }: { uri: string; title: string }) {
  return (
    <View style={styles.box} pointerEvents="none">
      {createElement('iframe', {
        src: uri,
        title: `${title} 위치 지도`,
        style: { border: 0, display: 'block', width: '100%', height: HEIGHT },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT, width: '100%' },
});

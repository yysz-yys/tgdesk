package kernel

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha512"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gotd/ige"
	gotdcrypto "github.com/gotd/td/crypto"
	"github.com/gotd/td/session"
	"github.com/gotd/td/session/tdesktop"
	"github.com/iyear/tdl/core/storage"
	"github.com/iyear/tdl/core/storage/keygen"
	"github.com/iyear/tdl/pkg/kv"
	"golang.org/x/crypto/pbkdf2"

	"tgdesk/internal/paths"
)

func testTDESKTOPMD5(value string) string {
	sum := md5.Sum([]byte(value))
	for i := range sum {
		sum[i] = sum[i]<<4 | sum[i]>>4
	}
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}

func testTDESKTOPFileKey(value string) string {
	return testTDESKTOPMD5(value)[:16]
}

func testArray(data []byte, order binary.ByteOrder) []byte {
	out := make([]byte, 4, 4+len(data))
	order.PutUint32(out, uint32(len(data)))
	return append(out, data...)
}

func testLocalKey(passcode, salt []byte) (out gotdcrypto.Key) {
	iters := 1
	if len(passcode) > 0 {
		iters = 100000
	}
	h := sha512.New()
	_, _ = h.Write(salt)
	_, _ = h.Write(passcode)
	_, _ = h.Write(salt)
	key := pbkdf2.Key(h.Sum(nil), salt, iters, len(out), sha512.New)
	copy(out[:], key)
	return out
}

func testEncryptLocal(decrypted []byte, localKey gotdcrypto.Key) []byte {
	if len(decrypted)%aes.BlockSize != 0 {
		panic("plaintext must be block aligned")
	}
	var msgKey [16]byte
	sum := sha1.Sum(decrypted)
	copy(msgKey[:], sum[:])
	aesKey, aesIV := gotdcrypto.OldKeys(localKey, msgKey, gotdcrypto.Server)
	block, err := aes.NewCipher(aesKey[:])
	if err != nil {
		panic(err)
	}
	out := make([]byte, 16+len(decrypted))
	copy(out, msgKey[:])
	ige.EncryptBlocks(block, aesIV[:], out[16:], decrypted)
	return out
}

func testReadArray(data []byte, order binary.ByteOrder) ([]byte, int) {
	if len(data) < 4 {
		return nil, 0
	}
	length := int(order.Uint32(data))
	if length == -1 {
		return nil, 4
	}
	if length > len(data)-4 {
		return nil, 0
	}
	return data[4 : 4+length], 4 + length
}

func testDecryptLocal(encrypted []byte, localKey gotdcrypto.Key) ([]byte, error) {
	if len(encrypted)%aes.BlockSize != 0 || len(encrypted) <= aes.BlockSize {
		return nil, fmt.Errorf("bad encrypted length %d", len(encrypted))
	}
	var msgKey [16]byte
	copy(msgKey[:], encrypted)
	encrypted = encrypted[16:]

	aesKey, aesIV := gotdcrypto.OldKeys(localKey, msgKey, gotdcrypto.Server)
	block, err := aes.NewCipher(aesKey[:])
	if err != nil {
		return nil, err
	}
	decrypted := make([]byte, len(encrypted))
	ige.DecryptBlocks(block, aesIV[:], decrypted, encrypted)
	if sum := sha1.Sum(decrypted); !bytes.Equal(sum[:16], msgKey[:]) {
		return nil, fmt.Errorf("msg key mismatch")
	}
	return decrypted, nil
}

// testExportLocalKey unwraps the local key from an exported key_datas file.
func testExportLocalKey(t *testing.T, root string) gotdcrypto.Key {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(root, "key_datas"))
	if err != nil {
		t.Fatal(err)
	}
	payload := raw[8 : len(raw)-16]
	salt, n := testReadArray(payload, binary.BigEndian)
	keyEncrypted, _ := testReadArray(payload[n:], binary.BigEndian)
	plain, err := testDecryptLocal(keyEncrypted, testLocalKey(nil, salt))
	if err != nil {
		t.Fatalf("decrypt local key: %v", err)
	}
	keyBytes, _ := testReadArray(plain, binary.LittleEndian)
	if len(keyBytes) < len(gotdcrypto.Key{}) {
		t.Fatalf("local key length = %d", len(keyBytes))
	}
	var key gotdcrypto.Key
	copy(key[:], keyBytes[:len(key)])
	return key
}

func testWriteTDESKTOPFile(t *testing.T, path string, data []byte) {
	t.Helper()
	var version [4]byte
	version[0] = 1
	var out bytes.Buffer
	out.WriteString("TDF$")
	out.Write(version[:])
	out.Write(data)
	hash := md5.New()
	hash.Write(data)
	var length [4]byte
	binary.LittleEndian.PutUint32(length[:], uint32(len(data)))
	hash.Write(length[:])
	hash.Write(version[:])
	hash.Write([]byte("TDF$"))
	out.Write(hash.Sum(nil))
	if err := os.WriteFile(path, out.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestTelegramDesktopImport(t *testing.T) {
	root := t.TempDir()
	t.Setenv("TGDESK_HOME", root)
	if err := os.MkdirAll(paths.TData(), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(paths.Data(), 0o700); err != nil {
		t.Fatal(err)
	}

	var salt [32]byte
	var localKey gotdcrypto.Key
	var authKey gotdcrypto.Key
	if _, err := rand.Read(salt[:]); err != nil {
		t.Fatal(err)
	}
	if _, err := rand.Read(localKey[:]); err != nil {
		t.Fatal(err)
	}
	if _, err := rand.Read(authKey[:]); err != nil {
		t.Fatal(err)
	}

	keyPlain := testArray(localKey[:], binary.LittleEndian)
	keyPlain = append(keyPlain, make([]byte, (16-len(keyPlain)%16)%16)...)
	keyEncrypted := testEncryptLocal(keyPlain, testLocalKey(nil, salt[:]))

	infoPlain := make([]byte, 16)
	binary.BigEndian.PutUint32(infoPlain[4:], 1)
	infoEncrypted := testEncryptLocal(infoPlain, localKey)

	var keyData []byte
	keyData = append(keyData, testArray(salt[:], binary.BigEndian)...)
	keyData = append(keyData, testArray(keyEncrypted, binary.BigEndian)...)
	keyData = append(keyData, testArray(infoEncrypted, binary.BigEndian)...)
	testWriteTDESKTOPFile(t, filepath.Join(paths.TData(), "key_data0"), keyData)

	auth := make([]byte, 0, 300)
	var u32 [4]byte
	binary.BigEndian.PutUint32(u32[:], 0x4b)
	auth = append(auth, u32[:]...)
	auth = append(auth, 0, 0, 0, 0)
	binary.BigEndian.PutUint32(u32[:], 12345)
	auth = append(auth, u32[:]...)
	binary.BigEndian.PutUint32(u32[:], 2)
	auth = append(auth, u32[:]...)
	binary.BigEndian.PutUint32(u32[:], 1)
	auth = append(auth, u32[:]...)
	binary.BigEndian.PutUint32(u32[:], 2)
	auth = append(auth, u32[:]...)
	auth = append(auth, authKey[:]...)
	dataPlain := append([]byte{0, 0, 0, 0}, auth...)
	dataPlain = append(dataPlain, make([]byte, (16-len(dataPlain)%16)%16)...)
	dataEncrypted := testEncryptLocal(dataPlain, localKey)
	dataFile := testArray(dataEncrypted, binary.BigEndian)
	testWriteTDESKTOPFile(t, filepath.Join(paths.TData(), testTDESKTOPFileKey("data")+"0"), dataFile)

	stg, err := kv.NewWithMap(map[string]string{
		kv.DriverTypeKey: string(kv.DriverBolt),
		"path":           paths.Data(),
	})
	if err != nil {
		t.Fatal(err)
	}
	defer stg.Close()
	ns, err := stg.Open("tgdesk")
	if err != nil {
		t.Fatal(err)
	}

	if err := importDesktopTData(ns, nil); err != nil {
		t.Fatal(err)
	}
	loaded, err := (&session.Loader{Storage: storage.NewSession(ns, false)}).Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if loaded.DC != 2 {
		t.Fatalf("DC = %d", loaded.DC)
	}
	if !bytes.Equal(loaded.AuthKey, authKey[:]) {
		t.Fatal("auth key mismatch")
	}
	if loaded.Addr == "" {
		t.Fatal("empty address")
	}
	user := loadAuthUser(ns)
	if user == nil || user.ID != 12345 {
		t.Fatalf("user = %+v", user)
	}
	t.Logf("imported user=%d dc=%d addr=%s", user.ID, loaded.DC, loaded.Addr)

	if _, err := exportTelegramDesktopTData(ns, *user); err != nil {
		t.Fatalf("export tdata: %v", err)
	}
	exported, err := tdesktop.Read(paths.TData(), nil)
	if err != nil {
		t.Fatalf("read exported tdata: %v", err)
	}
	if len(exported) != 1 || exported[0].Authorization.UserID != 12345 {
		t.Fatalf("exported accounts = %+v", exported)
	}
	t.Logf("exported tdata account=%d mainDC=%d", exported[0].Authorization.UserID, exported[0].Authorization.MainDC)

	// The exported folder must look like a modern Telegram Desktop tdata:
	// key_datas, <dataKey>s and <dataKey>/maps, with no legacy 0/1 variants.
	dataKey := testTDESKTOPFileKey("data")
	for _, name := range []string{
		"key_datas",
		dataKey + "s",
		filepath.Join(dataKey, "maps"),
	} {
		info, statErr := os.Stat(filepath.Join(paths.TData(), name))
		if statErr != nil || !info.Mode().IsRegular() {
			t.Fatalf("missing exported %s: %v", name, statErr)
		}
	}
	for _, name := range []string{"key_data0", "key_data1", dataKey + "0", dataKey + "1"} {
		if _, statErr := os.Stat(filepath.Join(paths.TData(), name)); !os.IsNotExist(statErr) {
			t.Fatalf("legacy file %s should not exist", name)
		}
	}

	// The MTP authorization payload must use Telegram's wide-id layout:
	// wide tag, user id, main DC, one key, no keys to destroy.
	raw, err := os.ReadFile(filepath.Join(paths.TData(), dataKey+"s"))
	if err != nil {
		t.Fatal(err)
	}
	if string(raw[:4]) != "TDF$" {
		t.Fatalf("bad magic %q", raw[:4])
	}
	if version := binary.LittleEndian.Uint32(raw[4:8]); version != tdesktopExportVersion {
		t.Fatalf("file version = %d, want %d", version, tdesktopExportVersion)
	}
	exportLocalKey := testExportLocalKey(t, paths.TData())
	payload := raw[8 : len(raw)-16]
	encrypted, _ := testReadArray(payload, binary.BigEndian)
	plain, err := testDecryptLocal(encrypted, exportLocalKey)
	if err != nil {
		t.Fatalf("decrypt exported data file: %v", err)
	}
	declared := binary.LittleEndian.Uint32(plain)
	if declared > uint32(len(plain)) {
		t.Fatalf("auth descriptor length = %d, padded plain = %d", declared, len(plain))
	}
	body := plain[4:]
	if got := binary.BigEndian.Uint32(body); got != 0x4b {
		t.Fatalf("dbi = %#x", got)
	}
	serializedLen := binary.BigEndian.Uint32(body[4:])
	if declared != 4+8+serializedLen {
		t.Fatalf("auth descriptor length = %d, serialized = %d", declared, serializedLen)
	}
	serialized := body[8 : 8+serializedLen]
	if tag := binary.BigEndian.Uint64(serialized); tag != ^uint64(0) {
		t.Fatalf("wide tag = %#x", tag)
	}
	if id := binary.BigEndian.Uint64(serialized[8:]); id != 12345 {
		t.Fatalf("user id = %d", id)
	}
	if dc := binary.BigEndian.Uint32(serialized[16:]); dc != 2 {
		t.Fatalf("main dc = %d", dc)
	}
	if keys := binary.BigEndian.Uint32(serialized[20:]); keys != 1 {
		t.Fatalf("keys = %d", keys)
	}
	if dc := binary.BigEndian.Uint32(serialized[24:]); dc != 2 {
		t.Fatalf("key dc = %d", dc)
	}
	if !bytes.Equal(serialized[28:28+256], authKey[:]) {
		t.Fatal("serialized auth key mismatch")
	}
	if destroy := binary.BigEndian.Uint32(serialized[28+256:]); destroy != 0 {
		t.Fatalf("keys to destroy = %d", destroy)
	}

	if identity, err := tdataSessionIdentity(); err != nil || identity == "" {
		t.Fatalf("tdata identity: %q %v", identity, err)
	}
	loadedSession, err := (&session.Loader{Storage: storage.NewSession(ns, false)}).Load(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !tdataMatchesSession(ns, loadedSession, user.ID) {
		t.Fatal("exported tdata does not match the session")
	}

	stg.Close()
	service := New()
	status := service.AuthStatus()
	if !status.Authorized {
		t.Fatalf("AuthStatus not authorized: %+v", status)
	}
	if status.User == nil || status.User.ID != 12345 {
		t.Fatalf("AuthStatus user = %+v", status.User)
	}

	// A matching fingerprint marker must not hide a session whose
	// completed-login user record was lost (for example after an abandoned QR
	// login). AuthStatus has to import tdata again instead of leaving the app
	// on the login screen.
	reopened, err := kv.NewWithMap(map[string]string{
		kv.DriverTypeKey: string(kv.DriverBolt),
		"path":           paths.Data(),
	})
	if err != nil {
		t.Fatal(err)
	}
	reopenedNS, err := reopened.Open("tgdesk")
	if err != nil {
		t.Fatal(err)
	}
	if err := reopenedNS.Delete(context.Background(), keygen.New(authUserKey)); err != nil {
		t.Fatal(err)
	}
	if err := reopened.Close(); err != nil {
		t.Fatal(err)
	}

	repaired := New()
	repairedStatus := repaired.AuthStatus()
	if !repairedStatus.Authorized {
		t.Fatalf("AuthStatus did not re-import tdata: %+v", repairedStatus)
	}
	if repairedStatus.User == nil || repairedStatus.User.ID != 12345 {
		t.Fatalf("re-imported user = %+v", repairedStatus.User)
	}

	// Logging out removes the session and the user record but keeps the marker.
	// A restart must stay logged out instead of resurrecting the consumed tdata.
	loggedOut, err := kv.NewWithMap(map[string]string{
		kv.DriverTypeKey: string(kv.DriverBolt),
		"path":           paths.Data(),
	})
	if err != nil {
		t.Fatal(err)
	}
	loggedOutNS, err := loggedOut.Open("tgdesk")
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"session", authUserKey} {
		if err := loggedOutNS.Delete(context.Background(), keygen.New(key)); err != nil {
			t.Fatal(err)
		}
	}
	if err := loggedOut.Close(); err != nil {
		t.Fatal(err)
	}

	afterLogout := New()
	if status := afterLogout.AuthStatus(); status.Authorized {
		t.Fatalf("AuthStatus re-imported tdata after logout: %+v", status)
	}
}

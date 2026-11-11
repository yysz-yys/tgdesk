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
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gotd/ige"
	gotdcrypto "github.com/gotd/td/crypto"
	"github.com/gotd/td/session"
	"github.com/gotd/td/session/tdesktop"
	"github.com/iyear/tdl/core/storage"
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

	if err := exportTelegramDesktopTData(ns, *user); err != nil {
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

	stg.Close()
	service := New("")
	status := service.AuthStatus()
	if !status.Authorized {
		t.Fatalf("AuthStatus not authorized: %+v", status)
	}
	if status.User == nil || status.User.ID != 12345 {
		t.Fatalf("AuthStatus user = %+v", status.User)
	}
}

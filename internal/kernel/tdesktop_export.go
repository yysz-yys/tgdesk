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

	"github.com/gotd/ige"
	"github.com/gotd/td/crypto"
	"github.com/gotd/td/session"
	"github.com/iyear/tdl/core/storage"
	"golang.org/x/crypto/pbkdf2"

	"tgdesk/internal/paths"
)

// This is the Telegram Desktop storage format version used by recent
// portable builds. A real tdata keeps its own version and we preserve it.
const defaultTDesktopVersion = uint32(0x005bb0ab)

// exportTelegramDesktopTData writes a no-passcode Telegram Desktop tdata from
// the authorized tdl session. It is intentionally best-effort: a successful
// login must not fail just because the optional export could not be written.
func exportTelegramDesktopTData(ns storage.Storage, user AuthUser) error {
	loader := session.Loader{Storage: storage.NewSession(ns, false)}
	data, err := loader.Load(context.Background())
	if err != nil {
		return fmt.Errorf("load session for tdata export: %w", err)
	}
	if data.DC <= 0 || len(data.AuthKey) != len(crypto.Key{}) {
		return fmt.Errorf("session has no usable auth key")
	}
	if user.ID == 0 {
		return fmt.Errorf("session has no user id")
	}

	version := existingTDesktopVersion()
	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	var localKey crypto.Key
	if _, err := rand.Read(localKey[:]); err != nil {
		return err
	}

	// key_data: local encryption key is protected by an empty passcode.
	// Telegram Desktop stores the full array length (4 + key bytes), not just
	// the key length, in the little-endian prefix.
	passcodeKey := tdesktopLocalKey(nil, salt)
	keyPlain := make([]byte, 4, 4+len(localKey))
	binary.LittleEndian.PutUint32(keyPlain, uint32(4+len(localKey)))
	keyPlain = append(keyPlain, localKey[:]...)
	keyPlain = append(keyPlain, make([]byte, (aes.BlockSize-len(keyPlain)%aes.BlockSize)%aes.BlockSize)...)
	keyEncrypted := tdesktopEncryptLocal(keyPlain, passcodeKey)

	infoPlain := make([]byte, 16)
	binary.LittleEndian.PutUint32(infoPlain[0:], 16) // full part length
	binary.BigEndian.PutUint32(infoPlain[4:], 1)     // one account
	binary.BigEndian.PutUint32(infoPlain[8:], 0)     // account index 0
	binary.BigEndian.PutUint32(infoPlain[12:], 0xffffffff)
	infoEncrypted := tdesktopEncryptLocal(infoPlain, localKey)

	keyData := append(tdesktopArray(salt, binary.BigEndian), tdesktopArray(keyEncrypted, binary.BigEndian)...)
	keyData = append(keyData, tdesktopArray(infoEncrypted, binary.BigEndian)...)

	authPlain := tdesktopAuthorization(user.ID, data.DC, data.AuthKey)
	authEncrypted := tdesktopEncryptLocal(authPlain, localKey)
	dataFile := tdesktopArray(authEncrypted, binary.BigEndian)

	root := paths.TData()
	if err := os.MkdirAll(root, 0o700); err != nil {
		return err
	}
	if err := backupTDesktopAuthFiles(root); err != nil {
		return fmt.Errorf("backup Telegram Desktop tdata: %w", err)
	}

	// Telegram Desktop probes 0, 1 and s. Write all variants with the same
	// content so a stale file cannot win over the newly generated one.
	keyNames := []string{"key_data0", "key_data1", "key_datas"}
	baseName := tdesktopFileKey("data")
	dataNames := []string{baseName + "0", baseName + "1", baseName + "s"}
	for _, name := range keyNames {
		if err := writeTDesktopFile(filepath.Join(root, name), keyData, version); err != nil {
			return err
		}
	}
	for _, name := range dataNames {
		if err := writeTDesktopFile(filepath.Join(root, name), dataFile, version); err != nil {
			return err
		}
	}

	// A map file is required by Telegram Desktop's account startup. An empty
	// map is valid; the auth key and session are read from the data file.
	mapPlain := make([]byte, 16)
	binary.LittleEndian.PutUint32(mapPlain[0:], 4)
	mapEncrypted := tdesktopEncryptLocal(mapPlain, localKey)
	mapFile := append(tdesktopArray(nil, binary.BigEndian), tdesktopArray(nil, binary.BigEndian)...)
	mapFile = append(mapFile, tdesktopArray(mapEncrypted, binary.BigEndian)...)
	accountDir := filepath.Join(root, baseName)
	if err := os.MkdirAll(accountDir, 0o700); err != nil {
		return err
	}
	if err := writeTDesktopFile(filepath.Join(accountDir, "maps"), mapFile, version); err != nil {
		return err
	}

	_ = os.WriteFile(
		filepath.Join(paths.Data(), ".telegram-desktop-import"),
		[]byte(tdataFingerprint()),
		0o600,
	)
	return nil
}

func backupTDesktopAuthFiles(root string) error {
	dest := filepath.Join(paths.Data(), "tdata-backup")
	if err := os.MkdirAll(dest, 0o700); err != nil {
		return err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() || !isTDataAuthFile(entry.Name()) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(root, entry.Name()))
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dest, entry.Name()), data, 0o600); err != nil {
			return err
		}
	}
	return nil
}

func existingTDesktopVersion() uint32 {
	for _, name := range []string{"key_data0", "key_data1", "key_datas"} {
		data, err := os.ReadFile(filepath.Join(paths.TData(), name))
		if err != nil || len(data) < 8 || !bytes.Equal(data[:4], []byte("TDF$")) {
			continue
		}
		return binary.LittleEndian.Uint32(data[4:8])
	}
	return defaultTDesktopVersion
}

func tdesktopAuthorization(userID int64, dc int, authKey []byte) []byte {
	body := make([]byte, 0, 8+8+4+4+len(authKey)+16)
	var u32 [4]byte
	var u64 [8]byte

	// Wide user id marker. Telegram's modern user ids no longer fit in uint32.
	binary.BigEndian.PutUint32(u32[:], 0xffffffff)
	body = append(body, u32[:]...)
	body = append(body, u32[:]...)
	binary.BigEndian.PutUint64(u64[:], uint64(userID))
	body = append(body, u64[:]...)
	binary.BigEndian.PutUint32(u32[:], uint32(dc))
	body = append(body, u32[:]...)

	binary.BigEndian.PutUint32(u32[:], 1) // one DC key
	body = append(body, u32[:]...)
	binary.BigEndian.PutUint32(u32[:], uint32(dc))
	body = append(body, u32[:]...)
	body = append(body, authKey...)
	// Empty "keys to destroy" list.
	body = append(body, 0, 0, 0, 0)

	// EncryptedDescriptor: first uint32 = unpadded descriptor length, then
	// dbi, then QByteArray length + serialized authorization.
	serializedLen := len(body)
	dataLen := 12 + serializedLen
	padded := make([]byte, (dataLen+aes.BlockSize-1)/aes.BlockSize*aes.BlockSize)
	binary.LittleEndian.PutUint32(padded[0:], uint32(dataLen))
	binary.BigEndian.PutUint32(padded[4:], 0x4b) // dbiMtpAuthorization
	binary.BigEndian.PutUint32(padded[8:], uint32(serializedLen))
	copy(padded[12:], body)
	return padded
}

func tdesktopArray(data []byte, order binary.ByteOrder) []byte {
	out := make([]byte, 4, 4+len(data))
	order.PutUint32(out, uint32(len(data)))
	return append(out, data...)
}

func tdesktopLocalKey(passcode, salt []byte) (out crypto.Key) {
	iterations := 1
	if len(passcode) > 0 {
		iterations = 100000
	}
	h := sha512.New()
	_, _ = h.Write(salt)
	_, _ = h.Write(passcode)
	_, _ = h.Write(salt)
	key := pbkdf2.Key(h.Sum(nil), salt, iterations, len(out), sha512.New)
	copy(out[:], key)
	return out
}

func tdesktopEncryptLocal(decrypted []byte, localKey crypto.Key) []byte {
	if len(decrypted)%aes.BlockSize != 0 {
		return nil
	}
	var msgKey [16]byte
	sum := sha1.Sum(decrypted)
	copy(msgKey[:], sum[:])
	aesKey, aesIV := crypto.OldKeys(localKey, msgKey, crypto.Server)
	block, err := aes.NewCipher(aesKey[:])
	if err != nil {
		return nil
	}
	out := make([]byte, 16+len(decrypted))
	copy(out, msgKey[:])
	ige.EncryptBlocks(block, aesIV[:], out[16:], decrypted)
	return out
}

func tdesktopFileKey(value string) string {
	sum := md5.Sum([]byte(value)) // #nosec G401 - Telegram Desktop file naming
	for i := range sum {
		sum[i] = sum[i]<<4 | sum[i]>>4
	}
	return strings.ToUpper(hex.EncodeToString(sum[:]))[:16]
}

func writeTDesktopFile(path string, data []byte, version uint32) error {
	var versionBytes [4]byte
	binary.LittleEndian.PutUint32(versionBytes[:], version)

	var out bytes.Buffer
	out.WriteString("TDF$")
	out.Write(versionBytes[:])
	out.Write(data)

	hash := md5.New() // #nosec G401 - Telegram Desktop file checksum
	_, _ = hash.Write(data)
	var length [4]byte
	binary.LittleEndian.PutUint32(length[:], uint32(len(data)))
	_, _ = hash.Write(length[:])
	_, _ = hash.Write(versionBytes[:])
	_, _ = hash.Write([]byte("TDF$"))
	out.Write(hash.Sum(nil))

	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, out.Bytes(), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", filepath.Base(path), err)
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("replace %s: %w", filepath.Base(path), err)
	}
	return nil
}
